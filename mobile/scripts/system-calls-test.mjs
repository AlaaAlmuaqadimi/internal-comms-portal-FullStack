/**
 * Native call UI bridge tests with a fake expo-callkit-telecom (no device).
 *
 *   npm run test:calls --prefix mobile
 *
 * Covers: socket ring -> system UI, push ring -> call id learned, answer from
 * the system UI or our screen (no double accept), fulfil after media, end in
 * both directions without loops, mute/speaker, push token, and a closed app
 * answered from the lock screen (events arriving before the call is known).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSystemCallBridge, moduleEndReason, randomEventId } from '../src/calls/systemCalls.js';
import {
  configurePushTokens,
  platformOf,
  registerPushToken,
  resetPushTokens,
  unregisterPushToken,
} from '../src/services/pushTokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Fake module: one session at a time, listeners, recorded calls. */
function fakeModule() {
  const listeners = {};
  const log = [];
  let session = null;
  let n = 0;
  let pushToken = null;

  const emit = (name, event) => (listeners[name] || []).forEach((fn) => fn(event));
  const listener = (name) => (fn) => {
    (listeners[name] ||= []).push(fn);
    return { remove: () => { listeners[name] = listeners[name].filter((f) => f !== fn); } };
  };
  const addSession = (s) => {
    session = s;
    emit('added', { session: s });
  };

  const calls = {
    log,
    get session() { return session; },
    addCallSessionAddedListener: listener('added'),
    addCallAnsweredListener: listener('answered'),
    addCallEndedListener: listener('ended'),
    addCallSessionRemovedListener: listener('removed'),
    addSetMutedActionListener: listener('muted'),
    addVoIPPushTokenUpdatedListener: listener('token'),
    async getActiveCallSession() { return session; },
    async reportIncomingCall(event) {
      log.push(['reportIncomingCall', event]);
      if (session) throw new Error('A call session already exists');
      addSession({ id: `s${(n += 1)}`, origin: 'incoming', status: 'ringing', incomingCallEvent: event });
    },
    async startOutgoingCall(recipient, options) {
      log.push(['startOutgoingCall', recipient, options]);
      if (session) throw new Error('A call session already exists');
      const id = `s${(n += 1)}`;
      addSession({ id, origin: 'outgoingApp', status: 'requesting' });
      return id;
    },
    async answerCall(id) {
      log.push(['answerCall', id]);
      emit('answered', { id, requestId: `req-${id}` });
    },
    async fulfillIncomingCallConnected(requestId) { log.push(['fulfill', requestId]); },
    async reportOutgoingCallConnected(id) { log.push(['outgoingConnected', id]); },
    async reportCallEnded(id, reason) {
      log.push(['reportCallEnded', id, reason]);
      const s = session;
      session = null;
      emit('ended', { id, session: s }); // the real module also fires onCallEnded
      emit('removed', { id });
    },
    async setMuted(id, muted) { log.push(['setMuted', id, muted]); },
    setAudioSessionPortOverride(on) { log.push(['speaker', on]); },
    registerVoIPPush() { log.push(['registerVoIPPush']); },
    getVoIPPushToken() { return pushToken; },

    // test helpers: what the OS / a push does
    pushRing(callId) {
      addSession({ id: `s${(n += 1)}`, origin: 'incoming', status: 'ringing', incomingCallEvent: { serverCallId: callId } });
      return session.id;
    },
    userAnswers() { emit('answered', { id: session.id, requestId: `req-${session.id}` }); },
    userEnds() {
      const s = session;
      session = null;
      emit('ended', { id: s.id, session: s });
      emit('removed', { id: s.id });
    },
    userMutes(muted) { emit('muted', { id: session.id, isMuted: muted }); },
    newToken(token) { pushToken = { token, type: 'FCM' }; emit('token', { token, type: 'FCM' }); },
  };
  return calls;
}

function setup() {
  const calls = fakeModule();
  const events = { answered: [], ended: [], muted: [] };
  let ids = 0;
  const bridge = createSystemCallBridge({
    calls,
    onAnswer: (callId) => events.answered.push(callId),
    onEnd: (callId) => events.ended.push(callId),
    onMuted: (muted) => events.muted.push(muted),
    newEventId: () => `evt-${(ids += 1)}`,
  });
  bridge.attach();
  return { calls, bridge, events };
}

check('no module (Expo Go): no bridge', () => {
  assert.equal(createSystemCallBridge({ calls: null, onAnswer() {}, onEnd() {} }), null);
});

check('socket ring: the system UI rings with a fixed caller id and no video/hold', async () => {
  const { calls, bridge } = setup();
  bridge.reportIncoming({ id: 'call-1' }, 'مكتب المدير');
  await tick();
  const [, event] = calls.log[0];
  assert.deepEqual(event, {
    eventId: 'evt-1',
    serverCallId: 'call-1',
    hasVideo: false,
    supportsHolding: false,
    supportsDTMF: false,
    caller: { id: 'internal-comms', displayName: 'مكتب المدير' },
  });
  assert.equal(bridge.hasSession('call-1'), true);
  bridge.reportIncoming({ id: 'call-1' }, 'again');
  assert.equal(calls.log.length, 1, 'never reported twice');
});

check('push already rang: the socket ring does nothing harmful', async () => {
  const { calls, bridge } = setup();
  calls.pushRing('call-1');
  bridge.reportIncoming({ id: 'call-1' }, 'x');
  await tick();
  assert.equal(calls.log.length, 0, 'already linked from the push session');
});

check('answer in the system UI -> onAnswer(callId) once; media -> fulfil', async () => {
  const { calls, bridge, events } = setup();
  calls.pushRing('call-7');
  calls.userAnswers();
  await tick();
  assert.deepEqual(events.answered, ['call-7']);
  bridge.connected('call-7');
  assert.deepEqual(calls.log.at(-1), ['fulfill', 'req-s1']);
  bridge.connected('call-7');
  assert.equal(calls.log.filter(([n]) => n === 'fulfill').length, 1, 'fulfil only once');
});

check('closed app answered from the lock screen: call id comes from the push session', async () => {
  const calls = fakeModule();
  const sessionId = calls.pushRing('call-cold'); // before JS / the bridge exist
  const events = { answered: [] };
  const bridge = createSystemCallBridge({ calls, onAnswer: (id) => events.answered.push(id), onEnd() {} });
  bridge.attach();
  calls.userAnswers(); // flushed answer event after JS starts
  await tick();
  assert.deepEqual(events.answered, ['call-cold']);
  assert.equal(bridge.hasSession('call-cold'), true);
  bridge.connected('call-cold');
  assert.deepEqual(calls.log.at(-1), ['fulfill', `req-${sessionId}`]);
});

check('answer on our own screen: the OS is told, and its echo does not accept twice', async () => {
  const { calls, bridge, events } = setup();
  bridge.reportIncoming({ id: 'call-2' }, 'x');
  await tick();
  bridge.answerFromApp('call-2');
  await tick();
  assert.deepEqual(calls.log.at(-1), ['answerCall', 's1']);
  assert.deepEqual(events.answered, [], 'no second accept from the echo');
  bridge.connected('call-2');
  assert.deepEqual(calls.log.at(-1), ['fulfill', 'req-s1']);
});

check('declined / ended in the system UI -> onEnd(callId)', async () => {
  const { calls, events } = setup();
  calls.pushRing('call-3');
  calls.userEnds();
  await tick();
  assert.deepEqual(events.ended, ['call-3']);
});

check('our call ended -> the system call is dismissed once, no onEnd loop', async () => {
  const { calls, bridge, events } = setup();
  bridge.reportIncoming({ id: 'call-4' }, 'x');
  await tick();
  bridge.end('call-4', 'missed');
  bridge.end('call-4', 'missed');
  await tick();
  assert.deepEqual(calls.log.filter(([n]) => n === 'reportCallEnded'), [['reportCallEnded', 's1', 'unanswered']]);
  assert.deepEqual(events.ended, [], 'our own end is not reported back');
  assert.equal(bridge.hasSession('call-4'), false);
});

check('outgoing call: started with the OS, connected after media, dismissed at the end', async () => {
  const { calls, bridge } = setup();
  await bridge.startOutgoing({ id: 'call-5' }, 'أحمد');
  assert.deepEqual(calls.log[0], ['startOutgoingCall', { id: 'internal-comms', displayName: 'أحمد' }, { hasVideo: false, supportsHolding: false, supportsDTMF: false }]);
  bridge.connected('call-5');
  assert.deepEqual(calls.log.at(-1), ['outgoingConnected', 's1']);
  bridge.end('call-5', 'ended');
  assert.deepEqual(calls.log.at(-1), ['reportCallEnded', 's1', 'remoteEnded']);
});

check('a failing module call never throws into the app', async () => {
  const calls = fakeModule();
  calls.startOutgoingCall = async () => { throw new Error('telecom refused'); };
  calls.reportIncomingCall = async () => { throw new Error('busy'); };
  const bridge = createSystemCallBridge({ calls, onAnswer() {}, onEnd() {} });
  bridge.attach();
  await bridge.startOutgoing({ id: 'c' });
  bridge.reportIncoming({ id: 'd' });
  await tick();
  bridge.end('unknown', 'ended');
  bridge.connected('unknown');
  bridge.setMuted('unknown', true);
});

check('mute: both directions, no echo loop; speaker sent only on change', async () => {
  const { calls, bridge, events } = setup();
  calls.pushRing('call-6');
  calls.userMutes(true);
  assert.deepEqual(events.muted, [true]);
  bridge.setMuted('call-6', true); // the app state following the system: no echo
  assert.equal(calls.log.some(([n]) => n === 'setMuted'), false);
  bridge.setMuted('call-6', false);
  assert.deepEqual(calls.log.at(-1), ['setMuted', 's1', false]);
  bridge.setSpeaker(true);
  bridge.setSpeaker(true);
  bridge.setSpeaker(false);
  assert.deepEqual(calls.log.filter(([n]) => n === 'speaker'), [['speaker', true], ['speaker', false]]);
});

check('mute: the OS echo of quick taps never flips the button back', async () => {
  const { calls, bridge, events } = setup();
  calls.pushRing('call-7');
  bridge.setMuted('call-7', true);
  bridge.setMuted('call-7', false); // second tap before the OS answered the first
  assert.deepEqual(calls.log.filter(([n]) => n === 'setMuted'), [['setMuted', 's1', true], ['setMuted', 's1', false]]);
  calls.userMutes(true); // late echo of the first tap
  calls.userMutes(false); // echo of the second
  assert.deepEqual(events.muted, [], 'echoes of our own requests are not reported');
  calls.userMutes(true); // a real mute from the system call screen
  assert.deepEqual(events.muted, [true]);
});

check('mute: an echo that never came does not swallow a later system change', async () => {
  const calls = fakeModule();
  const events = [];
  let clock = 0;
  const bridge = createSystemCallBridge({
    calls,
    onAnswer() {},
    onEnd() {},
    onMuted: (muted) => events.push(muted),
    now: () => clock,
  });
  bridge.attach();
  calls.pushRing('call-8');
  bridge.setMuted('call-8', true); // the OS never reports this one back
  clock += 5000;
  calls.userMutes(false);
  calls.userMutes(true); // the user mutes from the lock screen
  assert.deepEqual(events, [false, true]);
});

check('push token: register, read, follow updates', () => {
  const { calls, bridge } = setup();
  bridge.registerPush();
  assert.deepEqual(calls.log.at(-1), ['registerVoIPPush']);
  assert.equal(bridge.getPushToken(), null);
  const seen = [];
  const stop = bridge.onPushToken((value) => seen.push(value));
  calls.newToken('fcm-token-abcdefghijklmnopqrstuvwxyz');
  assert.deepEqual(seen, [{ token: 'fcm-token-abcdefghijklmnopqrstuvwxyz', type: 'FCM' }]);
  assert.deepEqual(bridge.getPushToken(), { token: 'fcm-token-abcdefghijklmnopqrstuvwxyz', type: 'FCM' });
  stop();
  calls.newToken('another-token-abcdefghijklmnop');
  assert.equal(seen.length, 1);
});

check('detach removes every listener', async () => {
  const { calls, bridge, events } = setup();
  bridge.detach();
  calls.pushRing('call-8');
  calls.userAnswers();
  await tick();
  assert.deepEqual(events.answered, []);
});

check('end reasons map to ones the module knows; event ids are UUID v4', () => {
  assert.equal(moduleEndReason('missed'), 'unanswered');
  assert.equal(moduleEndReason('micDenied'), 'failed');
  assert.equal(moduleEndReason('rejected'), 'remoteEnded');
  assert.match(randomEventId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

check('push token: sent once per value, platform from the token type, removed at sign-out', async () => {
  const calls = [];
  configurePushTokens({
    push: {
      register: async (body) => calls.push(['register', body]),
      unregister: async (token) => calls.push(['unregister', token]),
    },
  });
  resetPushTokens();
  assert.equal(platformOf('FCM'), 'android');
  assert.equal(platformOf('APNS_VOIP'), 'ios');
  await registerPushToken({ token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', type: 'FCM' });
  await registerPushToken({ token: 'tok-aaaaaaaaaaaaaaaaaaaaaaaa', type: 'FCM' });
  assert.equal(calls.length, 1, 'same token sent once');
  await registerPushToken({ token: 'tok-bbbbbbbbbbbbbbbbbbbbbbbb', type: 'FCM' });
  assert.deepEqual(calls.at(-1), ['register', { token: 'tok-bbbbbbbbbbbbbbbbbbbbbbbb', platform: 'android' }]);
  await unregisterPushToken();
  assert.deepEqual(calls.at(-1), ['unregister', 'tok-bbbbbbbbbbbbbbbbbbbbbbbb']);
  assert.equal(await unregisterPushToken(), false, 'nothing left to remove');
});

check('push token: a failed send is retried next time and never throws', async () => {
  let fail = true;
  const sent = [];
  configurePushTokens({
    push: {
      register: async (body) => { if (fail) throw new Error('offline'); sent.push(body); },
      unregister: async () => { throw new Error('offline'); },
    },
  });
  resetPushTokens();
  assert.equal(await registerPushToken({ token: 'tok-cccccccccccccccccccccccc', type: 'FCM' }), false);
  fail = false;
  assert.equal(await registerPushToken({ token: 'tok-cccccccccccccccccccccccc', type: 'FCM' }), true);
  assert.equal(sent.length, 1);
  assert.equal(await unregisterPushToken(), false);
});

check('CallContext: system UI wiring (no InCallManager, no double ring, token on accept)', () => {
  const source = fs.readFileSync(path.join(here, '../src/context/CallContext.js'), 'utf8');
  assert.match(source, /\.\.\.\(SYSTEM_CALLS \? \{ inCallManager: null \} : \{\}\)/);
  assert.match(source, /useRingtone\(state\.phase === PHASES\.INCOMING && !SYSTEM_CALLS\)/);
  assert.match(source, /\.\.\.\(pushToken \? \{ pushToken \} : \{\}\)/);
  assert.match(source, /bridge\.end\(call\.id, endedReason\)/);
  assert.match(source, /pendingAnswerRef\.current = callId/);
  // Ask for the microphone while on screen: a locked phone cannot show the dialog.
  assert.match(source, /askCallPermissions\(\);[\s\S]{0,120}bridge\.registerPush\(\)/);
  const overlay = fs.readFileSync(path.join(here, '../src/components/calls/CallOverlay.js'), 'utf8');
  assert.match(overlay, /!\(systemCalls && state\.phase === PHASES\.INCOMING\)/);
  const session = fs.readFileSync(path.join(here, '../src/calls/callSession.js'), 'utf8');
  assert.match(session, /AppState\.currentState !== 'active'\) return false/);
  // Declines reach the server even when the socket is down.
  assert.match(source, /api\.calls\.decline\(callId\)\.catch/);
  assert.match(source, /api\.calls\.decline\(call\.id\)\.catch/);
  // Closed app: the native receiver posts the push's decline link.
  const app = JSON.parse(fs.readFileSync(path.join(here, '../app.json'), 'utf8'));
  const plugins = app.expo.plugins;
  const callkit = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-callkit-telecom');
  assert.equal(callkit[1].androidEventReceiver, '.CallEndedReceiver');
  assert.ok(plugins.includes('./plugins/withCallEndedReceiver'));
  const receiver = fs.readFileSync(path.join(here, '../plugins/CallEndedReceiver.kt'), 'utf8');
  assert.match(receiver, /"onCallEnded"/);
  assert.match(receiver, /declineUrl/);
  assert.match(receiver, /goAsync\(\)/);
  // Missed calls: channel id shared with the server, set up after sign-in.
  assert.match(source, /setupDeviceNotifications\(\);/);
  const notes = fs.readFileSync(path.join(here, '../src/services/deviceNotifications.js'), 'utf8');
  assert.match(notes, /MISSED_CALL_CHANNEL = 'missed-calls'/);
  const serverPush = path.join(here, '../../backend/src/modules/push/callPush.js');
  if (fs.existsSync(serverPush)) {
    assert.match(fs.readFileSync(serverPush, 'utf8'), /MISSED_CALL_CHANNEL = 'missed-calls'/);
  }
  const auth = fs.readFileSync(path.join(here, '../src/context/AuthContext.js'), 'utf8');
  assert.ok(auth.indexOf('await unregisterPushToken()') < auth.indexOf('await api.auth.logout()'), 'token removed before the server logout');
});

check('the bridge never logs', () => {
  const source = fs.readFileSync(path.join(here, '../src/calls/systemCalls.js'), 'utf8');
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

console.log(`\n[test:calls:system] ${passed} checks passed`);
