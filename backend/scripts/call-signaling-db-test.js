/**
 * End-to-end Phase B signalling test: real HTTP server, real socket.io
 * clients, real database.
 *
 *   npm run test:calls:signaling:db --prefix backend
 *
 * Requires a migrated MySQL/MariaDB instance (same DB_* variables as the API),
 * JWT keys, and `npm install` (socket.io + socket.io-client). Creates
 * disposable employees/calls/notifications/audit rows and removes them
 * afterwards.
 *
 * Signalling is forced on for this process only, with short timers so the ring
 * timeout and the disconnect grace can be observed quickly.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.CALL_SIGNALING_ENABLED = 'true';
process.env.CALL_RING_TIMEOUT_SECONDS = '2';
process.env.CALL_DISCONNECT_GRACE_SECONDS = '1';
process.env.CALL_INVITE_RATE_MAX = '100';
process.env.SIGNALING_TICKET_RATE_MAX = '100';

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { pool } = await import('../src/db/pool.js');
const { signAccessToken } = await import('../src/lib/jwt.js');
const { attachSignaling, closeSignaling, SIGNALING_NAMESPACE, SIGNALING_PATH } = await import(
  '../src/modules/calls/signaling/signaling.server.js'
);
const { io: connectClient } = await import('socket.io-client');

let passed = 0;
const createdEmployees = [];
const sockets = [];
let httpServer = null;
let baseUrl = null;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err?.stack || err}`);
    process.exitCode = 1;
  }
}

const HOST = 'candidate:1 1 udp 2122260223 192.168.1.20 54400 typ host generation 0';
const RELAY = 'candidate:3 1 udp 41885439 10.9.9.9 3478 typ relay raddr 41.208.10.5 rport 54400';
const SDP = `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=${HOST}\r\na=${RELAY}\r\n`;

function tokenFor(employeeId) {
  return signAccessToken({
    sub: crypto.randomUUID(),
    emp: employeeId,
    username: `sig-test-${employeeId.slice(0, 8)}`,
    roles: ['employee'],
    perms: {},
  });
}

async function createEmployee(name, orgUnitId) {
  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO employees
       (id, org_unit_id, code, full_name_ar, full_name_en, job_title_ar, presence, is_active)
     VALUES (?, ?, ?, ?, ?, 'موظف اختبار', 'offline', 1)`,
    [id, orgUnitId, `SIGTEST-${id.slice(0, 8)}`, name, name]
  );
  createdEmployees.push(id);
  return id;
}

async function requestTicket(employeeId) {
  const res = await fetch(`${baseUrl}/api/calls/signaling/ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(employeeId)}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function connect(employeeId) {
  const { body } = await requestTicket(employeeId);
  const socket = connectClient(`${baseUrl}${SIGNALING_NAMESPACE}`, {
    path: SIGNALING_PATH,
    auth: { ticket: body.ticket },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  socket.ticket = body.ticket;
  return socket;
}

function emit(socket, event, payload) {
  return socket.timeout(5000).emitWithAck(event, payload);
}

function next(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, handler);
  });
}

function nothing(socket, event, ms = 600) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => {
      socket.off(event, handler);
      reject(new Error(`unexpected ${event}: ${JSON.stringify(payload).slice(0, 120)}`));
    };
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callRow(callId) {
  const [rows] = await pool.execute(
    'SELECT status, ended_reason FROM calls WHERE id = ?',
    [callId]
  );
  return rows[0];
}

async function notificationCount(callId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE type = 'missed_call'
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.callId')) = ?`,
    [callId]
  );
  return Number(rows[0].n);
}

async function main() {
  assert.ok(env.callSignaling.enabled, 'signalling must be enabled for this test');
  assert.ok(env.jwt.privateKey && env.jwt.publicKey, 'JWT keys are required (npm run keys)');

  const [units] = await pool.query(
    `SELECT id, kind FROM org_units WHERE deleted_at IS NULL AND is_active = 1`
  );
  const root = units.find((u) => u.kind === 'root');
  const deputy = units.find((u) => u.kind === 'deputy');
  const ordinary = units.find((u) => !['root', 'deputy'].includes(u.kind));
  assert.ok(root && deputy && ordinary, 'root, deputy and one ordinary unit are required');

  const empA = await createEmployee('إشارة أ', ordinary.id);
  const empB = await createEmployee('إشارة ب', ordinary.id);
  const empC = await createEmployee('إشارة ج', ordinary.id);
  const director = await createEmployee('مدير إشارة', root.id);

  httpServer = createApp().listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  await attachSignaling(httpServer);

  // --- tickets ----------------------------------------------------------------
  await check('ticket endpoint returns a ticket and ICE servers', async () => {
    const { status, body } = await requestTicket(empA);
    assert.equal(status, 201);
    assert.equal(typeof body.ticket, 'string');
    assert.ok(Array.isArray(body.iceServers));
    assert.equal(typeof body.turnConfigured, 'boolean');
  });

  const a = await connect(empA);
  const b = await connect(empB);
  const c = await connect(empC);
  const d = await connect(director);

  await check('a used ticket cannot open a second socket', async () => {
    const reused = connectClient(`${baseUrl}${SIGNALING_NAMESPACE}`, {
      path: SIGNALING_PATH,
      auth: { ticket: a.ticket },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(reused);
    const err = await new Promise((resolve) => reused.once('connect_error', resolve));
    assert.equal(err.message, 'UNAUTHORIZED');
  });

  // --- happy path ---------------------------------------------------------------
  let callId = null;
  await check('invite -> incoming -> accept -> offer/answer/ice -> end', async () => {
    const incoming = next(b, 'call:incoming');
    const invited = await emit(a, 'call:invite', { calleeEmployeeId: empB });
    assert.equal(invited.ok, true);
    assert.equal(invited.call.status, 'ringing');
    callId = invited.call.id;

    const ring = await incoming;
    assert.equal(ring.id, callId);
    assert.equal(ring.direction, 'incoming');
    assert.equal(ring.redacted, false);

    const accepted = next(a, 'call:accepted');
    assert.equal((await emit(b, 'call:accept', { callId })).ok, true);
    assert.equal((await accepted).status, 'accepted');

    const offer = next(b, 'signal:offer');
    assert.equal((await emit(a, 'signal:offer', { callId, data: { type: 'offer', sdp: SDP } })).ok, true);
    const offerPayload = await offer;
    assert.deepEqual(Object.keys(offerPayload).sort(), ['callId', 'data']);
    assert.equal(offerPayload.data.sdp, SDP, 'direct calls are not filtered');

    const answer = next(a, 'signal:answer');
    assert.equal((await emit(b, 'signal:answer', { callId, data: { type: 'answer', sdp: SDP } })).ok, true);
    await answer;

    const ice = next(b, 'signal:ice');
    await emit(a, 'signal:ice', { callId, data: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 } });
    assert.equal((await ice).data.candidate, HOST);
  });

  await check('the callee cannot send an offer, an outsider cannot signal', async () => {
    const wrongRole = await emit(b, 'signal:offer', { callId, data: { type: 'offer', sdp: SDP } });
    const outsider = await emit(c, 'signal:ice', { callId, data: { candidate: HOST } });
    const unknown = await emit(c, 'signal:ice', { callId: crypto.randomUUID(), data: { candidate: HOST } });
    for (const reply of [wrongRole, outsider, unknown]) {
      assert.equal(reply.ok, false);
      assert.equal(reply.code, 'CALL_FORBIDDEN');
    }
  });

  await check('ending the call notifies the other side', async () => {
    const ended = next(b, 'call:ended');
    assert.equal((await emit(a, 'call:end', { callId })).ok, true);
    assert.equal((await ended).status, 'ended');
    assert.equal(
      (await emit(a, 'signal:ice', { callId, data: { candidate: HOST } })).code,
      'CALL_FORBIDDEN',
      'no signals after the call ended'
    );
  });

  // --- policy over the socket -----------------------------------------------------
  await check('employee -> Director is denied exactly like an unknown target', async () => {
    const toDirector = await emit(a, 'call:invite', { calleeEmployeeId: director });
    const toUnknown = await emit(a, 'call:invite', { calleeEmployeeId: crypto.randomUUID() });
    assert.equal(toDirector.ok, false);
    assert.deepEqual(toDirector, toUnknown);
    assert.equal(toDirector.code, 'CALL_TARGET_FORBIDDEN');
    await nothing(d, 'call:incoming', 300);
  });

  let leadershipCallId = null;
  await check('Director -> employee: callee sees only the label, relay-only', async () => {
    const incoming = next(a, 'call:incoming');
    const invited = await emit(d, 'call:invite', { calleeEmployeeId: empA });
    leadershipCallId = invited.call.id;
    const ring = await incoming;
    assert.equal(ring.redacted, true);
    assert.equal(ring.canCallBack, false);
    assert.equal(ring.iceTransportPolicy, 'relay');
    assert.equal(ring.caller.employeeId, null);
    assert.equal(ring.caller.avatarUrl, null);
    assert.equal(JSON.stringify(ring).includes(director), false, 'director id must not appear');
  });

  await check('relay-only call: host candidates are dropped, relay forwarded', async () => {
    const accepted = next(d, 'call:accepted');
    await emit(a, 'call:accept', { callId: leadershipCallId });
    await accepted;

    const silent = nothing(a, 'signal:ice', 500);
    const dropped = await emit(d, 'signal:ice', {
      callId: leadershipCallId,
      data: { candidate: HOST, sdpMid: '0', sdpMLineIndex: 0 },
    });
    assert.deepEqual(dropped, { ok: true, dropped: true });
    await silent;

    const relayed = next(a, 'signal:ice');
    await emit(d, 'signal:ice', {
      callId: leadershipCallId,
      data: { candidate: RELAY, sdpMid: '0', sdpMLineIndex: 0 },
    });
    assert.equal((await relayed).data.candidate, RELAY);

    const offer = next(a, 'signal:offer');
    await emit(d, 'signal:offer', { callId: leadershipCallId, data: { type: 'offer', sdp: SDP } });
    const filtered = (await offer).data.sdp;
    assert.equal(filtered.includes('typ host'), false);
    assert.equal(filtered.includes('typ relay'), true);
  });

  // --- busy ---------------------------------------------------------------------------
  await check('calling a busy employee returns busy and does not ring them', async () => {
    const silent = nothing(a, 'call:incoming', 500);
    const reply = await emit(c, 'call:invite', { calleeEmployeeId: empA });
    assert.equal(reply.ok, true);
    assert.equal(reply.call.status, 'busy');
    await silent;
    assert.equal(await notificationCount(reply.call.id), 0, 'busy creates no notification');
  });

  await check('a caller already in a call cannot start another', async () => {
    const reply = await emit(a, 'call:invite', { calleeEmployeeId: empC });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'CALL_INVALID_STATE');
  });

  await emit(d, 'call:end', { callId: leadershipCallId });

  // --- reject / timeout -------------------------------------------------------------
  await check('reject reaches the caller and creates no notification', async () => {
    const invited = await emit(a, 'call:invite', { calleeEmployeeId: empB });
    const rejected = next(a, 'call:rejected');
    await emit(b, 'call:reject', { callId: invited.call.id });
    assert.equal((await rejected).status, 'rejected');
    assert.equal(await notificationCount(invited.call.id), 0);
  });

  await check('ring timeout marks missed once and notifies once', async () => {
    const invited = await emit(a, 'call:invite', { calleeEmployeeId: empB });
    const missedForCaller = next(a, 'call:missed', 5000);
    const missedForCallee = next(b, 'call:missed', 5000);
    await Promise.all([missedForCaller, missedForCallee]);
    const row = await callRow(invited.call.id);
    assert.equal(row.status, 'missed');
    assert.equal(row.ended_reason, 'timeout');
    assert.equal(await notificationCount(invited.call.id), 1);
    const late = await emit(b, 'call:accept', { callId: invited.call.id });
    assert.equal(late.code, 'CALL_INVALID_STATE', 'a late accept must fail');
  });

  // --- disconnect grace ---------------------------------------------------------------
  await check('a participant who disconnects is ended after the grace period', async () => {
    const invited = await emit(a, 'call:invite', { calleeEmployeeId: empB });
    await emit(b, 'call:accept', { callId: invited.call.id });
    const ended = next(b, 'call:ended', 5000);
    a.disconnect();
    assert.equal((await ended).status, 'ended');
    const row = await callRow(invited.call.id);
    assert.equal(row.ended_reason, 'disconnected');
    assert.equal(await notificationCount(invited.call.id), 0);
  });

  // --- boot sweep ---------------------------------------------------------------------
  await check('boot sweep marks an already-expired ringing call missed', async () => {
    const staleId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO calls (id, caller_employee_id, callee_employee_id, call_type, status,
                          ring_expires_at, metadata)
       VALUES (?, ?, ?, 'audio', 'ringing', DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE), ?)`,
      [staleId, empC, empB, JSON.stringify({ callerOrgUnitKind: ordinary.kind, calleeOrgUnitKind: ordinary.kind })]
    );
    await closeSignaling();
    const second = createApp().listen(0);
    await new Promise((resolve) => second.once('listening', resolve));
    try {
      await attachSignaling(second);
      const row = await callRow(staleId);
      assert.equal(row.status, 'missed');
      assert.equal(await notificationCount(staleId), 1);
    } finally {
      await closeSignaling();
      await new Promise((resolve) => second.close(resolve));
    }
  });
}

try {
  await main();
} finally {
  for (const socket of sockets) socket.disconnect();
  await closeSignaling().catch(() => {});
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));

  if (createdEmployees.length > 0) {
    const ph = createdEmployees.map(() => '?').join(', ');
    await pool
      .execute(
        `DELETE FROM notifications
          WHERE type = 'missed_call'
            AND id IN (SELECT notification_id FROM (
                  SELECT notification_id FROM notification_recipients
                   WHERE employee_id IN (${ph})) AS mine)`,
        createdEmployees
      )
      .catch(() => {});
    await pool
      .execute(`DELETE FROM notification_recipients WHERE employee_id IN (${ph})`, createdEmployees)
      .catch(() => {});
    await pool
      .execute(
        `DELETE FROM audit_log
          WHERE action = 'call.denied'
            AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.callerEmployeeId')) IN (${ph})`,
        createdEmployees
      )
      .catch(() => {});
    await pool
      .execute(
        `DELETE FROM calls WHERE caller_employee_id IN (${ph}) OR callee_employee_id IN (${ph})`,
        [...createdEmployees, ...createdEmployees]
      )
      .catch(() => {});
    await pool
      .execute(`DELETE FROM employees WHERE id IN (${ph})`, createdEmployees)
      .catch(() => {});
  }

  console.log(`\n[test:calls:signaling:db] ${passed} checks passed`);
  await pool.end();
}
