/**
 * Call security code tests (no device, no network).
 *
 *   npm run test:calls --prefix mobile
 *
 * Covers the SHA-256 implementation, fingerprint parsing, both phones showing
 * the same code on an honest call, and a man in the middle being detected:
 * different codes when it swaps fingerprints, "mismatch" when its answer does
 * not match the commitment, and no code when the commitment comes too late.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createCallSession } from '../src/calls/callSession.js';
import {
  SECURITY_CODE_STATUS,
  commitmentFor,
  extractFingerprint,
  formatSecurityCode,
  isCommitment,
  securityCodeFor,
  sha256Hex,
} from '../src/calls/securityCode.js';

let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async (n = 20) => {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await tick();
  }
};

const randomFingerprint = () =>
  crypto.randomBytes(32).toString('hex').toUpperCase().match(/../g).join(':');
const sdpWith = (type, fingerprint) =>
  `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 ${fingerprint}\r\na=setup:${type === 'offer' ? 'actpass' : 'active'}\r\n`;

/** Fake WebRTC whose peer connections each have their own certificate. */
function fakeRtc() {
  class FakePC {
    constructor() {
      this.fingerprint = randomFingerprint();
      this.listeners = {};
      this.connectionState = 'new';
    }
    addTrack() {}
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    emit(event, payload) { (this.listeners[event] || []).forEach((fn) => fn(payload)); }
    async createOffer() { return { type: 'offer', sdp: sdpWith('offer', this.fingerprint) }; }
    async createAnswer() { return { type: 'answer', sdp: sdpWith('answer', this.fingerprint) }; }
    async setLocalDescription() { this.emit('icecandidate', { candidate: null }); }
    async setRemoteDescription() {}
    async addIceCandidate() {}
    close() {}
  }
  return {
    RTCPeerConnection: FakePC,
    RTCSessionDescription: class { constructor(d) { Object.assign(this, d); } },
    RTCIceCandidate: class { constructor(d) { Object.assign(this, d); } },
    mediaDevices: {
      async getUserMedia() {
        const track = { enabled: true, stop() {} };
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      },
    },
  };
}

// Every session a test opens, closed after the test so no timer outlives it.
const openSessions = [];

function makeSession(direction, sendSignal, { commitWaitMs = 30 } = {}) {
  const security = [];
  const session = createCallSession({
    call: { id: 'call-42', direction, iceTransportPolicy: 'all' },
    iceServers: [],
    sendSignal,
    onConnected: () => {},
    onFailed: () => {},
    onSecurityCode: (result) => security.push(result),
    commitWaitMs,
    rtc: fakeRtc(),
    inCallManager: null,
    requestMicrophone: async () => true,
  });
  openSessions.push(session);
  return { session, security };
}

/**
 * Connects a caller and a callee through a relay. `tamper(from, kind, data)`
 * can rewrite or drop a signal (return undefined to drop), like a malicious
 * server would.
 */
async function connect({ tamper = (_from, _kind, data) => data, callerWaitMs, calleeStartsFirst = true } = {}) {
  let caller;
  let callee;
  const relay = (from, to) => (kind, data) => {
    setImmediate(() => {
      const out = tamper(from, kind, data);
      if (out !== undefined) to().session.handleSignal(kind, out);
    });
  };
  caller = makeSession('outgoing', relay('caller', () => callee), { commitWaitMs: callerWaitMs ?? 30 });
  callee = makeSession('incoming', relay('callee', () => caller));
  if (calleeStartsFirst) {
    await callee.session.start();
    await caller.session.start();
  } else {
    await Promise.all([caller.session.start(), callee.session.start()]);
  }
  await settle();
  return { caller, callee };
}

check('SHA-256 matches Node crypto (ASCII, Arabic, emoji, block edges)', () => {
  const inputs = ['', 'abc', 'رمز الأمان', '🐪🌴', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(1000)];
  for (const input of inputs) {
    assert.equal(sha256Hex(input), crypto.createHash('sha256').update(input, 'utf8').digest('hex'), input.slice(0, 10));
  }
});

check('fingerprints are parsed and normalised; missing ones give null', () => {
  const fp = randomFingerprint();
  assert.equal(extractFingerprint(sdpWith('offer', fp.toLowerCase())), `sha-256 ${fp}`);
  assert.equal(extractFingerprint(sdpWith('offer', fp).replace(/\r\n/g, '\n')), `sha-256 ${fp}`);
  assert.equal(extractFingerprint('v=0\r\ns=-\r\n'), null);
  assert.equal(extractFingerprint(null), null);
});

check('the code is 6 digits, ordered (offer, answer), and bound to the call id', () => {
  const a = `sha-256 ${randomFingerprint()}`;
  const b = `sha-256 ${randomFingerprint()}`;
  const code = securityCodeFor('call-1', a, b);
  assert.match(code, /^\d{6}$/);
  assert.equal(securityCodeFor('call-1', a, b), code);
  assert.notEqual(securityCodeFor('call-2', a, b), code);
  assert.equal(formatSecurityCode('482913'), '482 913');
  assert.equal(isCommitment(commitmentFor('call-1', a)), true);
  assert.equal(isCommitment('xyz'), false);
});

check('honest call: both phones show the same code', async () => {
  const { caller, callee } = await connect();
  assert.equal(caller.security.length, 1);
  assert.equal(callee.security.length, 1);
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.READY);
  assert.equal(callee.security[0].status, SECURITY_CODE_STATUS.READY);
  assert.match(caller.security[0].code, /^\d{6}$/);
  assert.equal(caller.security[0].code, callee.security[0].code);
});

check('honest call also works when both phones start at the same time', async () => {
  const { caller, callee } = await connect({ calleeStartsFirst: false, callerWaitMs: 200 });
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.READY);
  assert.equal(caller.security[0].code, callee.security[0].code);
});

check('man in the middle swapping fingerprints: the two codes differ', async () => {
  // The attacker terminates DTLS on both sides with its own certificates and
  // sends a correct commitment for the certificate it shows the caller.
  const towardCaller = `sha-256 ${randomFingerprint()}`.split(' ')[1];
  const towardCallee = `sha-256 ${randomFingerprint()}`.split(' ')[1];
  const tamper = (from, kind, data) => {
    if (kind === 'sas' && from === 'callee') {
      return { commit: commitmentFor('call-42', `sha-256 ${towardCaller}`) };
    }
    if (kind === 'offer') return { type: 'offer', sdp: sdpWith('offer', towardCallee) };
    if (kind === 'answer') return { type: 'answer', sdp: sdpWith('answer', towardCaller) };
    return data;
  };
  const { caller, callee } = await connect({ tamper });
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.READY);
  assert.equal(callee.security[0].status, SECURITY_CODE_STATUS.READY);
  assert.notEqual(caller.security[0].code, callee.security[0].code, 'the people see different codes');
});

check('answer that does not match the commitment: caller sees "mismatch"', async () => {
  const tamper = (from, kind, data) => {
    if (kind === 'answer') return { type: 'answer', sdp: sdpWith('answer', randomFingerprint()) };
    return data;
  };
  const { caller } = await connect({ tamper });
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.MISMATCH);
  assert.equal(caller.security[0].code, null);
});

check('a commitment held back until after the offer is refused (no code)', async () => {
  let held = null;
  let callerRef = null;
  const tamper = (from, kind, data) => {
    if (kind === 'sas') {
      held = data; // delay it past the caller's wait
      return undefined;
    }
    return data;
  };
  const { caller, callee } = await connect({ tamper, callerWaitMs: 10 });
  callerRef = caller;
  // Delivering it now (after the offer) must not produce a "ready" code.
  await callerRef.session.handleSignal('sas', held);
  await settle();
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.UNAVAILABLE);
  assert.equal(callee.security[0].status, SECURITY_CODE_STATUS.READY);
});

check('older callee without a commitment: the call goes on, caller shows no code', async () => {
  const tamper = (from, kind, data) => (kind === 'sas' ? undefined : data);
  const { caller } = await connect({ tamper, callerWaitMs: 10 });
  assert.equal(caller.security[0].status, SECURITY_CODE_STATUS.UNAVAILABLE);
});

check('only the callee commits; a callee ignores commitments sent to it', async () => {
  const sentByCaller = [];
  const { session, security } = makeSession('outgoing', (kind) => sentByCaller.push(kind), { commitWaitMs: 5 });
  await session.start();
  assert.equal(sentByCaller.includes('sas'), false);
  session.close();
  assert.equal(security.length, 0);

  const sentByCallee = [];
  const callee = makeSession('incoming', (kind, data) => sentByCallee.push([kind, data]));
  await callee.session.start();
  assert.equal(sentByCallee[0][0], 'sas');
  assert.equal(isCommitment(sentByCallee[0][1].commit), true);
  await callee.session.handleSignal('sas', { commit: 'f'.repeat(64) }); // ignored
  callee.session.close();
});

check('logs never contain fingerprints, commitments or codes', async () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  let result;
  try {
    result = await connect();
  } finally {
    console.log = original;
  }
  const text = lines.join('\n');
  assert.equal(/[0-9A-F]{2}(:[0-9A-F]{2}){5,}/i.test(text), false, 'no fingerprint');
  assert.equal(/[0-9a-f]{64}/.test(text), false, 'no commitment');
  assert.equal(text.includes(result.caller.security[0].code), false, 'no code');
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
  } finally {
    openSessions.splice(0).forEach((session) => session.close());
  }
}

console.log(`\n[test:calls:security] ${passed} checks passed`);
