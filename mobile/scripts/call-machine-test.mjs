/**
 * Pure tests for the mobile call state machine (no device, no network).
 *
 *   npm run test:calls --prefix mobile
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENDED_REASONS,
  PHASES,
  callReducer,
  elapsedSeconds,
  endedReasonKey,
  findOrphanedCalls,
  initialCallState,
  otherParty,
} from '../src/calls/callMachine.js';
import { translations } from '../src/i18n/translations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const me = 'emp-me';
const peer = 'emp-peer';

function view(overrides = {}) {
  return {
    id: 'call-1',
    status: 'ringing',
    direction: 'outgoing',
    redacted: false,
    canCallBack: true,
    relayOnly: false,
    iceTransportPolicy: 'all',
    answeredAt: null,
    endedAt: null,
    durationSeconds: 0,
    caller: { employeeId: me, name: 'أنا' },
    callee: { employeeId: peer, name: 'زميل' },
    ...overrides,
  };
}

function incomingView(overrides = {}) {
  return view({
    direction: 'incoming',
    caller: { employeeId: peer, name: 'زميل' },
    callee: { employeeId: me, name: 'أنا' },
    ...overrides,
  });
}

function run(...actions) {
  return actions.reduce((state, action) => callReducer(state, action), initialCallState);
}

const server = (event, call) => ({ type: 'SERVER_EVENT', event, call });

// ---- outgoing ----------------------------------------------------------------

check('outgoing: invite -> ringing -> accepted -> connecting -> active', () => {
  let state = run({ type: 'OUTGOING_STARTED', call: view() });
  assert.equal(state.phase, PHASES.OUTGOING);
  state = callReducer(state, server('call:accepted', view({ status: 'accepted', answeredAt: '2026-11-18T10:00:00Z' })));
  assert.equal(state.phase, PHASES.CONNECTING);
  state = callReducer(state, { type: 'MEDIA_CONNECTED' });
  assert.equal(state.phase, PHASES.ACTIVE);
  assert.equal(state.call.answeredAt, '2026-11-18T10:00:00Z');
});

check('outgoing to a busy employee ends immediately with "busy"', () => {
  const state = run({ type: 'OUTGOING_STARTED', call: view({ status: 'busy' }) });
  assert.equal(state.phase, PHASES.ENDED);
  assert.equal(state.endedReason, ENDED_REASONS.BUSY);
});

check('outgoing: rejected, missed and ended reach the caller', () => {
  for (const [event, reason] of [
    ['call:rejected', ENDED_REASONS.REJECTED],
    ['call:missed', ENDED_REASONS.MISSED],
    ['call:ended', ENDED_REASONS.ENDED],
  ]) {
    const state = run({ type: 'OUTGOING_STARTED', call: view() }, server(event, view({ status: 'x' })));
    assert.equal(state.phase, PHASES.ENDED, event);
    assert.equal(state.endedReason, reason, event);
  }
});

check('a second call cannot start while one is live', () => {
  const state = run(
    { type: 'OUTGOING_STARTED', call: view() },
    { type: 'OUTGOING_STARTED', call: view({ id: 'call-2' }) }
  );
  assert.equal(state.call.id, 'call-1');
});

// ---- incoming ----------------------------------------------------------------

check('incoming: ring -> accept here -> connecting -> active', () => {
  let state = run(server('call:incoming', incomingView()));
  assert.equal(state.phase, PHASES.INCOMING);
  state = callReducer(state, { type: 'ACCEPT_SENT' });
  assert.equal(state.phase, PHASES.CONNECTING);
  assert.equal(state.acceptedHere, true);
  state = callReducer(state, server('call:accepted', incomingView({ status: 'accepted' })));
  assert.equal(state.phase, PHASES.CONNECTING, 'our own accept keeps us connecting');
  state = callReducer(state, { type: 'MEDIA_CONNECTED' });
  assert.equal(state.phase, PHASES.ACTIVE);
});

check('incoming: accepted on another device stops the ring here', () => {
  const state = run(server('call:incoming', incomingView()), server('call:accepted', incomingView({ status: 'accepted' })));
  assert.equal(state.phase, PHASES.ENDED);
  assert.equal(state.endedReason, ENDED_REASONS.ANSWERED_ELSEWHERE);
});

check('incoming: caller cancels -> cancelled', () => {
  const state = run(server('call:incoming', incomingView()), server('call:cancelled', incomingView({ status: 'cancelled' })));
  assert.equal(state.endedReason, ENDED_REASONS.CANCELLED);
});

check('a second incoming ring during a call is ignored', () => {
  const state = run(
    { type: 'OUTGOING_STARTED', call: view() },
    server('call:incoming', incomingView({ id: 'call-2' }))
  );
  assert.equal(state.phase, PHASES.OUTGOING);
  assert.equal(state.call.id, 'call-1');
});

check('a new ring is accepted while the previous summary is showing', () => {
  const state = run(
    { type: 'OUTGOING_STARTED', call: view({ status: 'busy' }) },
    server('call:incoming', incomingView({ id: 'call-2' }))
  );
  assert.equal(state.phase, PHASES.INCOMING);
  assert.equal(state.call.id, 'call-2');
});

check('events for another call id do not touch the current call', () => {
  const state = run(
    { type: 'OUTGOING_STARTED', call: view() },
    server('call:ended', view({ id: 'other', status: 'ended' })),
    server('call:accepted', view({ id: 'other', status: 'accepted' }))
  );
  assert.equal(state.phase, PHASES.OUTGOING);
});

check('ACCEPT_SENT outside an incoming ring does nothing', () => {
  const state = run({ type: 'OUTGOING_STARTED', call: view() }, { type: 'ACCEPT_SENT' });
  assert.equal(state.phase, PHASES.OUTGOING);
});

// ---- local actions -------------------------------------------------------------

check('our own hang-up uses the server view for the summary', () => {
  const state = run(
    { type: 'OUTGOING_STARTED', call: view() },
    server('call:accepted', view({ status: 'accepted' })),
    { type: 'MEDIA_CONNECTED' },
    { type: 'LOCAL_ENDED', call: view({ status: 'ended', endedAt: 'x', durationSeconds: 42 }) }
  );
  assert.equal(state.phase, PHASES.ENDED);
  assert.equal(state.endedReason, ENDED_REASONS.ENDED);
  assert.equal(elapsedSeconds(state.call), 42);
});

check('reject and cancel map to their reasons', () => {
  const rejected = run(server('call:incoming', incomingView()), { type: 'LOCAL_ENDED', call: incomingView({ status: 'rejected' }) });
  assert.equal(rejected.endedReason, ENDED_REASONS.REJECTED);
  const cancelled = run({ type: 'OUTGOING_STARTED', call: view() }, { type: 'LOCAL_ENDED', call: view({ status: 'cancelled' }) });
  assert.equal(cancelled.endedReason, ENDED_REASONS.CANCELLED);
});

check('media failure ends the call as failed', () => {
  const state = run(
    server('call:incoming', incomingView()),
    { type: 'ACCEPT_SENT' },
    { type: 'MEDIA_FAILED' }
  );
  assert.equal(state.endedReason, ENDED_REASONS.FAILED);
});

check('a denied microphone ends with its own reason', () => {
  const state = run(
    server('call:incoming', incomingView()),
    { type: 'ACCEPT_SENT' },
    { type: 'MEDIA_FAILED', reason: ENDED_REASONS.MIC_DENIED }
  );
  assert.equal(state.endedReason, ENDED_REASONS.MIC_DENIED);
});

check('RESET returns to idle', () => {
  const state = run({ type: 'OUTGOING_STARTED', call: view() }, { type: 'RESET' });
  assert.deepEqual(state, initialCallState);
});

// ---- sync ------------------------------------------------------------------------

check('sync picks up a call that is still ringing for us', () => {
  const state = run({ type: 'SYNC', calls: [incomingView()] });
  assert.equal(state.phase, PHASES.INCOMING);
});

check('sync ends a live call the server no longer has', () => {
  const state = run({ type: 'OUTGOING_STARTED', call: view() }, { type: 'SYNC', calls: [] });
  assert.equal(state.phase, PHASES.ENDED);
});

check('sync moves an outgoing call that was accepted meanwhile to connecting', () => {
  const state = run({ type: 'OUTGOING_STARTED', call: view() }, { type: 'SYNC', calls: [view({ status: 'accepted' })] });
  assert.equal(state.phase, PHASES.CONNECTING);
});

check('accepted calls this device is not showing are orphans', () => {
  const idle = findOrphanedCalls(initialCallState, [view({ status: 'accepted' }), incomingView({ id: 'r' })]);
  assert.deepEqual(idle, ['call-1']);
  const live = run({ type: 'OUTGOING_STARTED', call: view() }, server('call:accepted', view({ status: 'accepted' })));
  assert.deepEqual(findOrphanedCalls(live, [view({ status: 'accepted' })]), []);
});

// ---- redaction and helpers -------------------------------------------------------

check('the other party comes straight from the server view (redaction kept)', () => {
  const redacted = incomingView({
    redacted: true,
    canCallBack: false,
    caller: { employeeId: null, name: 'المدير العام', avatarUrl: null, redacted: true },
  });
  const state = run(server('call:incoming', redacted));
  const party = otherParty(state.call);
  assert.equal(party.employeeId, null);
  assert.equal(party.name, 'المدير العام');
  assert.equal(state.call.canCallBack, false);
  assert.equal(otherParty(view()).employeeId, peer);
});

check('elapsed time counts from answeredAt', () => {
  const call = view({ status: 'accepted', answeredAt: '2026-11-18T10:00:00.000Z' });
  assert.equal(elapsedSeconds(call, Date.parse('2026-11-18T10:01:05.000Z')), 65);
  assert.equal(elapsedSeconds(view()), 0);
});

check('every ended reason has Arabic and English text', () => {
  for (const reason of Object.values(ENDED_REASONS)) {
    const key = endedReasonKey(reason).split('.');
    for (const lang of ['ar', 'en']) {
      const text = key.reduce((obj, k) => obj?.[k], translations[lang]);
      assert.equal(typeof text, 'string', `${lang} ${reason}`);
      assert.ok(text.length > 0);
    }
  }
});

check('the call UI never calls back a redacted caller', () => {
  const incoming = fs.readFileSync(path.join(mobileRoot, 'src/screens/main/IncomingCallScreen.js'), 'utf8');
  const active = fs.readFileSync(path.join(mobileRoot, 'src/screens/main/CallActiveScreen.js'), 'utf8');
  for (const source of [incoming, active]) {
    assert.equal(/employeeId/.test(source), false, 'call screens must not read employee ids');
  }
});

check('signalling client fetches a fresh ticket for every connection', () => {
  const source = fs.readFileSync(path.join(mobileRoot, 'src/services/signaling.js'), 'utf8');
  assert.match(source, /reconnection: false/);
  assert.match(source, /signalingTicket\(\)/);
  assert.equal(/console\.\w+\([^)]*(sdp|candidate|payload)/i.test(source), false, 'no signal payloads in logs');
});

console.log(`\n[test:calls] ${passed} checks passed`);
