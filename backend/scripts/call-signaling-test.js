/**
 * Pure Phase B signalling tests (no database, no socket server, no npm deps).
 *
 *   npm run test:calls:signaling --prefix backend
 *
 * Covers:
 *   - relay-only filtering of ICE candidates and SDP candidate lines
 *   - signal shape, size and role rules
 *   - one-time ticket issue / consume / expiry
 *   - ring and disconnect-grace timers on a fake clock
 *   - socket invite rate window
 *   - TURN credentials never contain the employee id
 *   - static guards on the signalling server source
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIGNAL_ERROR_CODES,
  SIGNAL_LIMITS,
  canSendSignal,
  filterSdpForRelay,
  isRelayCandidate,
  sanitizeSignal,
} from '../src/modules/calls/signaling/relay.js';
import { createTicketStore } from '../src/modules/calls/signaling/ticketStore.js';
import { createCallTimers } from '../src/modules/calls/signaling/callTimers.js';
import { createRateWindow } from '../src/modules/calls/signaling/rateWindow.js';
import { buildIceServers, hasTurn } from '../src/modules/calls/signaling/iceServers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
let passed = 0;
const pending = [];

function check(name, fn) {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS  ${name}`);
    } catch (err) {
      console.error(`FAIL  ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  };
  pending.push(run);
}

const HOST = 'candidate:1 1 udp 2122260223 192.168.1.20 54400 typ host generation 0';
const SRFLX = 'candidate:2 1 udp 1686052607 41.208.10.5 54400 typ srflx raddr 192.168.1.20 rport 54400';
const RELAY = 'candidate:3 1 udp 41885439 10.9.9.9 3478 typ relay raddr 41.208.10.5 rport 54400';

const SDP = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  `a=${HOST}`,
  `a=${SRFLX}`,
  `a=${RELAY}`,
  'a=fingerprint:sha-256 AB:CD',
  '',
].join('\r\n');

// ---- relay.js ---------------------------------------------------------------

check('only typ relay candidates count as relay', () => {
  assert.equal(isRelayCandidate(RELAY), true);
  assert.equal(isRelayCandidate(HOST), false);
  assert.equal(isRelayCandidate(SRFLX), false);
  assert.equal(isRelayCandidate(null), false);
});

check('relay-only SDP keeps relay candidates and every non-candidate line', () => {
  const filtered = filterSdpForRelay(SDP);
  assert.ok(!filtered.includes('typ host'), 'host candidate must be removed');
  assert.ok(!filtered.includes('typ srflx'), 'srflx candidate must be removed');
  assert.ok(filtered.includes('typ relay'), 'relay candidate must stay');
  assert.ok(filtered.includes('a=fingerprint:sha-256 AB:CD'), 'fingerprint must stay');
  assert.ok(filtered.includes('\r\n'), 'CRLF line endings must be preserved');
});

check('direct call SDP is forwarded unchanged', () => {
  const result = sanitizeSignal('offer', { type: 'offer', sdp: SDP }, { relayOnly: false });
  assert.deepEqual(result, { ok: true, drop: false, data: { type: 'offer', sdp: SDP } });
});

check('relay-only offer has non-relay candidates stripped', () => {
  const result = sanitizeSignal('offer', { type: 'offer', sdp: SDP }, { relayOnly: true });
  assert.equal(result.ok, true);
  assert.ok(!result.data.sdp.includes('typ host'));
  assert.ok(!result.data.sdp.includes('192.168.1.20 54400 typ'));
});

check('relay-only call drops host and srflx ICE candidates', () => {
  for (const candidate of [HOST, SRFLX]) {
    const result = sanitizeSignal('ice', { candidate, sdpMid: '0', sdpMLineIndex: 0 }, { relayOnly: true });
    assert.deepEqual(result, { ok: true, drop: true, data: null });
  }
});

check('relay-only call forwards relay ICE candidates', () => {
  const result = sanitizeSignal('ice', { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 }, { relayOnly: true });
  assert.deepEqual(result, {
    ok: true,
    drop: false,
    data: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 },
  });
});

check('direct call forwards host candidates', () => {
  const result = sanitizeSignal('ice', { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 });
  assert.equal(result.drop, false);
});

check('end-of-candidates markers are accepted', () => {
  assert.deepEqual(sanitizeSignal('ice', null, { relayOnly: true }), { ok: true, drop: false, data: null });
  const empty = sanitizeSignal('ice', { candidate: '' }, { relayOnly: true });
  assert.equal(empty.ok, true);
  assert.equal(empty.drop, false);
});

check('extra fields are not forwarded to the other participant', () => {
  const offer = sanitizeSignal('offer', { type: 'offer', sdp: SDP, employeeId: 'x', name: 'y' });
  assert.deepEqual(Object.keys(offer.data).sort(), ['sdp', 'type']);
  const ice = sanitizeSignal('ice', { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0, from: 'x' });
  assert.deepEqual(Object.keys(ice.data).sort(), ['candidate', 'sdpMLineIndex', 'sdpMid']);
});

check('malformed signals are rejected', () => {
  const bad = [
    ['offer', null],
    ['offer', { type: 'answer', sdp: SDP }],
    ['offer', { type: 'offer', sdp: '' }],
    ['answer', { type: 'answer', sdp: 42 }],
    ['ice', { candidate: 42 }],
    ['ice', { candidate: RELAY, sdpMLineIndex: -1 }],
    ['ice', { candidate: RELAY, sdpMid: 'x'.repeat(65) }],
    ['ice', []],
    ['bogus', {}],
  ];
  for (const [kind, data] of bad) {
    const result = sanitizeSignal(kind, data);
    assert.equal(result.ok, false, `${kind} ${JSON.stringify(data)?.slice(0, 40)} must be rejected`);
    assert.equal(result.code, SIGNAL_ERROR_CODES.INVALID_SIGNAL);
  }
});

check('oversized SDP and candidates are rejected', () => {
  const sdp = `v=0\r\n${'a=x\r\n'.repeat(SIGNAL_LIMITS.sdpMaxBytes / 4)}`;
  assert.equal(sanitizeSignal('offer', { type: 'offer', sdp }).code, SIGNAL_ERROR_CODES.SIGNAL_TOO_LARGE);
  const candidate = `candidate:${'9'.repeat(SIGNAL_LIMITS.candidateMaxBytes)} typ relay`;
  assert.equal(sanitizeSignal('ice', { candidate }).code, SIGNAL_ERROR_CODES.SIGNAL_TOO_LARGE);
});

check('caller offers, callee answers, both send ICE', () => {
  assert.equal(canSendSignal('offer', 'caller'), true);
  assert.equal(canSendSignal('offer', 'callee'), false);
  assert.equal(canSendSignal('answer', 'callee'), true);
  assert.equal(canSendSignal('answer', 'caller'), false);
  assert.equal(canSendSignal('ice', 'caller'), true);
  assert.equal(canSendSignal('ice', 'callee'), true);
  assert.equal(canSendSignal('ice', null), false);
  assert.equal(canSendSignal('offer', 'outsider'), false);
});

// ---- ticketStore.js ---------------------------------------------------------

check('a ticket can be consumed exactly once', () => {
  const store = createTicketStore({ ttlSeconds: 120 });
  const { ticket, expiresAt } = store.issue({ userId: 'u1', employeeId: 'e1' });
  assert.ok(ticket.length >= 40);
  assert.ok(!Number.isNaN(Date.parse(expiresAt)));
  assert.deepEqual(store.consume(ticket), { userId: 'u1', employeeId: 'e1' });
  assert.equal(store.consume(ticket), null, 'second use must fail');
});

check('an expired ticket is refused', () => {
  let clock = 1_000_000;
  const store = createTicketStore({ ttlSeconds: 120, now: () => clock });
  const { ticket } = store.issue({ userId: 'u1', employeeId: 'e1' });
  clock += 120_000;
  assert.equal(store.consume(ticket), null);
});

check('unknown and malformed tickets are refused', () => {
  const store = createTicketStore({ ttlSeconds: 120 });
  for (const value of [undefined, null, 42, '', 'short', 'x'.repeat(200), crypto.randomBytes(32).toString('base64url')]) {
    assert.equal(store.consume(value), null);
  }
});

check('tickets are stored hashed, not in clear text', () => {
  const store = createTicketStore({ ttlSeconds: 120 });
  const source = fs.readFileSync(path.join(backendRoot, 'src/modules/calls/signaling/ticketStore.js'), 'utf8');
  assert.match(source, /entries\.set\(hashTicket\(ticket\)/);
  const { ticket } = store.issue({ userId: 'u1', employeeId: 'e1' });
  assert.equal(store.size(), 1);
  assert.ok(ticket);
});

check('expired tickets are pruned', () => {
  let clock = 0;
  const store = createTicketStore({ ttlSeconds: 1, now: () => clock });
  store.issue({ userId: 'u1', employeeId: 'e1' });
  store.issue({ userId: 'u2', employeeId: 'e2' });
  clock += 2_000;
  store.prune();
  assert.equal(store.size(), 0);
});

// ---- callTimers.js ----------------------------------------------------------

function fakeClock() {
  let current = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => current,
    setTimer: (fn, delay) => {
      const id = nextId++;
      timers.set(id, { fn, at: current + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      current += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= current) {
          timers.delete(id);
          timer.fn();
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

check('ring timer fires once at the deadline', async () => {
  const clock = fakeClock();
  const expired = [];
  const timers = createCallTimers({
    onRingExpired: (callId) => expired.push(callId),
    onGraceExpired: () => {},
    ...clock,
  });
  timers.armRing('c1', 45_000);
  await clock.advance(44_999);
  assert.deepEqual(expired, []);
  await clock.advance(1);
  assert.deepEqual(expired, ['c1']);
  assert.equal(timers.hasRing('c1'), false);
});

check('re-arming a ring timer replaces the old one', async () => {
  const clock = fakeClock();
  const expired = [];
  const timers = createCallTimers({ onRingExpired: (id) => expired.push(id), onGraceExpired: () => {}, ...clock });
  timers.armRing('c1', 10_000);
  timers.armRing('c1', 20_000);
  await clock.advance(30_000);
  assert.deepEqual(expired, ['c1']);
});

check('a cleared ring timer never fires (accepted / rejected / cancelled)', async () => {
  const clock = fakeClock();
  const expired = [];
  const timers = createCallTimers({ onRingExpired: (id) => expired.push(id), onGraceExpired: () => {}, ...clock });
  timers.armRing('c1', 1_000);
  timers.clearRing('c1');
  await clock.advance(5_000);
  assert.deepEqual(expired, []);
});

check('a past deadline fires immediately (boot sweep re-arm)', async () => {
  const clock = fakeClock();
  const expired = [];
  const timers = createCallTimers({ onRingExpired: (id) => expired.push(id), onGraceExpired: () => {}, ...clock });
  timers.armRing('old', -5_000);
  await clock.advance(0);
  assert.deepEqual(expired, ['old']);
});

check('disconnect grace fires after the grace period', async () => {
  const clock = fakeClock();
  const ended = [];
  const timers = createCallTimers({
    onRingExpired: () => {},
    onGraceExpired: (employeeId, callId) => ended.push(`${employeeId}/${callId}`),
    ...clock,
  });
  timers.armGrace('e1', 'c1', 30);
  await clock.advance(29_999);
  assert.deepEqual(ended, []);
  await clock.advance(1);
  assert.deepEqual(ended, ['e1/c1']);
});

check('reconnecting cancels the grace timer', async () => {
  const clock = fakeClock();
  const ended = [];
  const timers = createCallTimers({ onRingExpired: () => {}, onGraceExpired: (e, c) => ended.push(c), ...clock });
  timers.armGrace('e1', 'c1', 30);
  timers.armGrace('e1', 'c2', 30);
  timers.armGrace('e2', 'c3', 30);
  timers.clearGraceForEmployee('e1');
  await clock.advance(60_000);
  assert.deepEqual(ended, ['c3']);
});

check('ending a call cancels its grace timers', async () => {
  const clock = fakeClock();
  const ended = [];
  const timers = createCallTimers({ onRingExpired: () => {}, onGraceExpired: (e, c) => ended.push(c), ...clock });
  timers.armGrace('e1', 'c1', 30);
  timers.clearGraceForCall('c1');
  await clock.advance(60_000);
  assert.deepEqual(ended, []);
});

check('a failing timer callback does not throw out of the timer', async () => {
  const clock = fakeClock();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const timers = createCallTimers({
      onRingExpired: async () => {
        throw new Error('db down');
      },
      onGraceExpired: () => {},
      ...clock,
    });
    timers.armRing('c1', 0);
    await clock.advance(0);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = originalError;
  }
  assert.ok(logged.some((line) => line.includes('db down')));
});

// ---- rateWindow.js ----------------------------------------------------------

check('socket invite limit allows max per window, then resets', () => {
  let clock = 0;
  const limiter = createRateWindow({ windowMs: 60_000, max: 10, now: () => clock });
  for (let i = 0; i < 10; i += 1) assert.equal(limiter.hit('u1'), true);
  assert.equal(limiter.hit('u1'), false);
  assert.equal(limiter.hit('u2'), true, 'limits are per user');
  clock += 60_000;
  assert.equal(limiter.hit('u1'), true);
});

// ---- iceServers.js ----------------------------------------------------------

check('no ICE servers when nothing is configured', () => {
  const servers = buildIceServers({});
  assert.deepEqual(servers, []);
  assert.equal(hasTurn(servers), false);
});

check('TURN credentials follow the coturn shared-secret scheme', () => {
  const secret = 'test-secret';
  const servers = buildIceServers({
    stunUrls: ['stun:turn.example.ly:3478'],
    turnUrls: ['turn:turn.example.ly:3478?transport=udp', 'turns:turn.example.ly:5349'],
    turnSharedSecret: secret,
    turnCredentialTtlSeconds: 3600,
    now: () => 1_000_000_000_000,
  });
  assert.equal(servers.length, 2);
  const turn = servers[1];
  const [expiry, randomId] = turn.username.split(':');
  assert.equal(Number(expiry), 1_000_000_000 + 3600);
  assert.match(randomId, /^[0-9a-f]{16}$/);
  const expected = crypto.createHmac('sha1', secret).update(turn.username).digest('base64');
  assert.equal(turn.credential, expected);
  assert.equal(hasTurn(servers), true);
});

check('TURN without a shared secret is not offered', () => {
  const servers = buildIceServers({ turnUrls: ['turn:turn.example.ly:3478'] });
  assert.deepEqual(servers, []);
});

// ---- static guards on the server source -------------------------------------

const serverSource = fs.readFileSync(
  path.join(backendRoot, 'src/modules/calls/signaling/signaling.server.js'),
  'utf8'
);

check('socket.io is loaded lazily, only when the flag is on', () => {
  assert.equal(/^import .*from 'socket\.io'/m.test(serverSource), false);
  assert.match(serverSource, /if \(!env\.callSignaling\.enabled\) return null;/);
  assert.match(serverSource, /await import\('socket\.io'\)/);
});

check('socket invites go through the Phase A policy with busy handling', () => {
  assert.match(serverSource, /callService\.inviteCall\(\{[\s\S]*checkBusy: true/);
  assert.equal(/evaluateCallPermission|employee_contacts/.test(serverSource), false);
});

check('relayed signals carry only callId and the sanitized data', () => {
  assert.match(serverSource, /emit\(`signal:\$\{kind\}`, \{ callId, data: result\.data \}\)/);
});

check('signalling never writes SDP or ICE to the database or logs', () => {
  assert.equal(/INSERT|UPDATE|pool\./.test(serverSource), false, 'no SQL in the socket layer');
  assert.equal(/console\.\w+\([^)]*(payload|sdp|candidate)/i.test(serverSource), false);
});

check('busy calls do not notify the callee', () => {
  const busyAt = serverSource.indexOf("case 'busy':");
  const busyCase = serverSource.slice(busyAt, serverSource.indexOf('default:', busyAt));
  assert.ok(busyAt !== -1, 'busy case missing');
  assert.match(busyCase, /toCaller\.emit\('call:busy'/);
  assert.equal(/toCallee/.test(busyCase), false);
});

const serviceSource = fs.readFileSync(path.join(backendRoot, 'src/modules/calls/call.service.js'), 'utf8');

check('busy is decided only after the policy allowed the call', () => {
  const inviteBody = serviceSource.slice(
    serviceSource.indexOf('export async function inviteCall'),
    serviceSource.indexOf('/** History for one participant')
  );
  const policyAt = inviteBody.indexOf('evaluateCallPermission(caller, target)');
  const deniedThrowAt = inviteBody.indexOf('throw targetDeniedError(decision.code)');
  const busyAt = inviteBody.indexOf('isEmployeeBusy(target.employeeId)');
  assert.ok(policyAt !== -1 && deniedThrowAt !== -1 && busyAt !== -1);
  assert.ok(busyAt > deniedThrowAt, 'a forbidden target must never be reported as busy');
});

check('ring timeout and disconnect updates keep their status guards', () => {
  assert.match(serviceSource, /ended_reason = 'timeout'\s+WHERE id = \? AND status = 'ringing'/);
  assert.match(serviceSource, /ended_reason = 'disconnected'[\s\S]*?WHERE id = \? AND status = 'accepted'/);
});

check('disconnect ending creates no notification', () => {
  const body = serviceSource.slice(
    serviceSource.indexOf('export async function endCallForDisconnect'),
    serviceSource.indexOf('export async function getSignalContext')
  );
  assert.equal(/createMissedCallNotification|notifications/.test(body), false);
});

check('every missed_call goes through the single notification writer', () => {
  // Regression: the foundation commit removed the redactedLabelForKind import
  // while missCall still wrote its notification inline (ReferenceError).
  assert.equal(/INSERT INTO notifications/.test(serviceSource), false, 'no inline notification insert');
  assert.equal(/redactedLabelForKind/.test(serviceSource), false);
  const missBody = serviceSource.slice(serviceSource.indexOf('export async function missCall'));
  assert.match(missBody, /createMissedCallNotification\(/);
});

for (const run of pending) {
  // eslint-disable-next-line no-await-in-loop
  await run();
}

console.log(`\n[test:calls:signaling] ${passed} checks passed`);
