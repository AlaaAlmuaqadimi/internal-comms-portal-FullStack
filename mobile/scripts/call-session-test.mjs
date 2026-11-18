/**
 * WebRTC call session tests with a fake WebRTC (no device, no network).
 *
 *   npm run test:calls --prefix mobile
 *
 * Covers the offer/answer/ICE order, queuing before the microphone is open,
 * relay-only enforcement, microphone denial, mute/speaker and cleanup.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCallSession, SESSION_FAILURES } from '../src/calls/callSession.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeRtc() {
  const instances = [];
  const tracks = [];

  class FakePC {
    constructor(config) {
      this.config = config;
      this.listeners = {};
      this.added = [];
      this.candidates = [];
      this.local = null;
      this.remote = null;
      this.closed = false;
      this.connectionState = 'new';
      instances.push(this);
    }
    addTrack(track) { this.added.push(track); }
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    emit(event, payload) { (this.listeners[event] || []).forEach((fn) => fn(payload)); }
    async createOffer() { return { type: 'offer', sdp: 'OFFER-SDP' }; }
    async createAnswer() { return { type: 'answer', sdp: 'ANSWER-SDP' }; }
    async setLocalDescription(description) {
      this.local = description;
      this.emit('icecandidate', {
        candidate: { candidate: 'candidate:1 1 udp 1 10.0.0.1 1 typ relay', sdpMid: '0', sdpMLineIndex: 0, extra: 'x' },
      });
      this.emit('icecandidate', { candidate: null });
    }
    async setRemoteDescription(description) { this.remote = description; }
    async addIceCandidate(candidate) { this.candidates.push(candidate); }
    close() { this.closed = true; }
    setState(state) { this.connectionState = state; this.emit('connectionstatechange'); }
  }

  const rtc = {
    RTCPeerConnection: FakePC,
    RTCSessionDescription: class { constructor(d) { Object.assign(this, d); } },
    RTCIceCandidate: class { constructor(d) { Object.assign(this, d); } },
    mediaDevices: {
      getUserMediaCalls: 0,
      async getUserMedia(constraints) {
        this.getUserMediaCalls += 1;
        assert.deepEqual(constraints, { audio: true, video: false });
        const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
        tracks.push(track);
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      },
    },
  };
  return { rtc, instances, tracks };
}

function fakeInCall() {
  const calls = [];
  return {
    calls,
    start: (opts) => calls.push(['start', opts]),
    stop: () => calls.push(['stop']),
    setForceSpeakerphoneOn: (on) => calls.push(['speaker', on]),
  };
}

const TURN = [{ urls: ['turn:turn.example.ly:3478'], username: 'u', credential: 'c' }];

function setup({ direction = 'outgoing', policy = 'all', iceServers = [], mic = true } = {}) {
  const fake = fakeRtc();
  const inCall = fakeInCall();
  const sent = [];
  const events = { connected: 0, failed: [] };
  const session = createCallSession({
    call: { id: 'call-1', direction, iceTransportPolicy: policy },
    iceServers,
    sendSignal: (kind, data) => sent.push([kind, data]),
    onConnected: () => { events.connected += 1; },
    onFailed: (reason) => events.failed.push(reason),
    rtc: fake.rtc,
    inCallManager: inCall,
    requestMicrophone: async () => mic,
  });
  return { ...fake, inCall, sent, events, session };
}

check('caller opens the mic, offers, and trickles ICE in the server shape', async () => {
  const { session, sent, instances, inCall } = setup();
  await session.start();
  assert.equal(session.role, 'caller');
  assert.equal(instances[0].config.iceTransportPolicy, 'all');
  assert.deepEqual(sent[0], ['ice', { candidate: 'candidate:1 1 udp 1 10.0.0.1 1 typ relay', sdpMid: '0', sdpMLineIndex: 0 }]);
  assert.deepEqual(sent[1], ['ice', null]);
  assert.deepEqual(sent[2], ['offer', { type: 'offer', sdp: 'OFFER-SDP' }]);
  assert.deepEqual(inCall.calls[0], ['start', { media: 'audio' }]);
  session.close();
});

check('caller applies the answer and queued ICE after it', async () => {
  const { session, instances } = setup();
  await session.start();
  await session.handleSignal('ice', { candidate: 'candidate:9 typ relay', sdpMid: '0', sdpMLineIndex: 0 });
  assert.equal(instances[0].candidates.length, 0, 'ICE before the answer is queued');
  await session.handleSignal('answer', { type: 'answer', sdp: 'ANSWER-SDP' });
  assert.equal(instances[0].remote.sdp, 'ANSWER-SDP');
  assert.equal(instances[0].candidates.length, 1);
  session.close();
});

check('callee: an offer that arrives before start() is answered once the mic is open', async () => {
  const { session, sent, instances } = setup({ direction: 'incoming' });
  await session.handleSignal('offer', { type: 'offer', sdp: 'OFFER-SDP' });
  await session.start();
  await tick();
  assert.equal(session.role, 'callee');
  assert.equal(instances[0].remote.sdp, 'OFFER-SDP');
  assert.ok(sent.some(([kind, data]) => kind === 'answer' && data.sdp === 'ANSWER-SDP'));
  assert.equal(sent.some(([kind]) => kind === 'offer'), false, 'the callee never offers');
  session.close();
});

check('callee ignores an answer and the caller ignores an offer', async () => {
  const callee = setup({ direction: 'incoming' });
  await callee.session.start();
  await callee.session.handleSignal('answer', { type: 'answer', sdp: 'X' });
  assert.equal(callee.instances[0].remote, null);
  const caller = setup();
  await caller.session.start();
  await caller.session.handleSignal('offer', { type: 'offer', sdp: 'X' });
  assert.equal(caller.instances[0].remote, null);
  callee.session.close();
  caller.session.close();
});

check('relay-only call without TURN fails before opening the microphone', async () => {
  const { session, events, rtc } = setup({ policy: 'relay', iceServers: [] });
  await session.start();
  assert.deepEqual(events.failed, [SESSION_FAILURES.FAILED]);
  assert.equal(rtc.mediaDevices.getUserMediaCalls, 0);
});

check('relay-only call with TURN uses iceTransportPolicy relay', async () => {
  const { session, instances } = setup({ policy: 'relay', iceServers: TURN });
  await session.start();
  assert.equal(instances[0].config.iceTransportPolicy, 'relay');
  assert.deepEqual(instances[0].config.iceServers, TURN);
  session.close();
});

check('microphone denied ends with micDenied', async () => {
  const { session, events, rtc } = setup({ mic: false });
  await session.start();
  assert.deepEqual(events.failed, [SESSION_FAILURES.MIC_DENIED]);
  assert.equal(rtc.mediaDevices.getUserMediaCalls, 0);
});

check('connected fires once; failed closes everything', async () => {
  const { session, events, instances, tracks } = setup();
  await session.start();
  instances[0].setState('connected');
  instances[0].setState('connected');
  assert.equal(events.connected, 1);
  instances[0].setState('failed');
  assert.deepEqual(events.failed, [SESSION_FAILURES.FAILED]);
  assert.equal(instances[0].closed, true);
  assert.equal(tracks[0].stopped, true);
});

check('mute and speaker reach the track and the audio router', async () => {
  const { session, tracks, inCall } = setup();
  await session.start();
  session.setMuted(true);
  assert.equal(tracks[0].enabled, false);
  session.setMuted(false);
  assert.equal(tracks[0].enabled, true);
  session.setSpeaker(true);
  assert.deepEqual(inCall.calls.at(-1), ['speaker', true]);
  session.close();
});

check('close stops the microphone, closes the peer and releases audio routing', async () => {
  const { session, tracks, instances, inCall, events } = setup();
  await session.start();
  session.close();
  session.close();
  assert.equal(tracks[0].stopped, true);
  assert.equal(instances[0].closed, true);
  assert.deepEqual(inCall.calls.at(-1), ['stop']);
  assert.equal(events.failed.length, 0, 'a normal close is not a failure');
  await session.handleSignal('ice', { candidate: 'x' });
});

check('a session closed while the mic is opening releases the mic', async () => {
  const { session, tracks } = setup();
  const started = session.start();
  session.close();
  await started;
  assert.equal(tracks.every((track) => track.stopped), true);
});

check('the session never logs SDP or ICE', () => {
  const source = fs.readFileSync(path.join(here, '../src/calls/callSession.js'), 'utf8');
  assert.equal(/console\./.test(source), false);
});

for (const [name, fn] of tests) {
  try {
    // eslint-disable-next-line no-await-in-loop
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log(`\n[test:calls:session] ${passed} checks passed`);
