/**
 * Phase D push tests: pure, no database, no network, no npm dependencies.
 *
 *   npm run test:push --prefix backend
 *
 * Covers the FCM HTTP v1 client (service-account JWT, token caching, retries,
 * dead-token detection, message shape) and the incoming-call push policy
 * (who gets what, privacy of the caller name, no late or duplicate rings).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAssertion,
  createFcmClient,
  isUnregisteredError,
  parseServiceAccount,
  toDataPayload,
} from '../src/modules/push/fcm.js';
import {
  END_REASONS,
  GENERIC_CALLER_NAME,
  PUSH_TYPES,
  callEndedData,
  createCallPushNotifier,
  incomingCallData,
} from '../src/modules/push/callPush.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(backendRoot, '..');

let passed = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'internal-comms-test',
  client_email: 'push@internal-comms-test.iam.gserviceaccount.com',
  private_key: PRIVATE_PEM,
  token_uri: 'https://oauth2.example.test/token',
};

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Fake fetch that answers the token endpoint and FCM. */
function fakeFetch({ sendStatuses = [], tokenLifetime = 3600 } = {}) {
  const calls = [];
  let tokenCount = 0;
  const statuses = [...sendStatuses];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === SERVICE_ACCOUNT.token_uri) {
      tokenCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: `access-${tokenCount}`, expires_in: tokenLifetime }),
      };
    }
    const next = statuses.length > 0 ? statuses.shift() : { status: 200 };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body || {},
    };
  };
  return { fetchImpl, calls, tokenRequests: () => tokenCount };
}

// ---- fcm.js -----------------------------------------------------------------

check('service account: required fields, escaped newlines in the key', () => {
  const parsed = parseServiceAccount({ ...SERVICE_ACCOUNT, private_key: PRIVATE_PEM.replace(/\n/g, '\\n') });
  assert.equal(parsed.projectId, 'internal-comms-test');
  assert.equal(parsed.privateKey, PRIVATE_PEM);
  assert.throws(() => parseServiceAccount({ project_id: 'x' }), /client_email, private_key/);
  assert.equal(parseServiceAccount({ ...SERVICE_ACCOUNT, token_uri: undefined }).tokenUri, 'https://oauth2.googleapis.com/token');
});

check('assertion: RS256 JWT with the FCM scope, verifiable with the public key', () => {
  const account = parseServiceAccount(SERVICE_ACCOUNT);
  const jwt = buildAssertion(account, 1_800_000_000_000);
  const [header, claims, signature] = jwt.split('.');
  assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decode(claims), {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: SERVICE_ACCOUNT.token_uri,
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  });
  const ok = crypto.createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
  assert.equal(ok, true);
});

check('data payload: every value is a string, empty values dropped', () => {
  assert.deepEqual(toDataPayload({ a: 1, b: true, c: 'x', d: null, e: undefined }), { a: '1', b: 'true', c: 'x' });
});

check('dead tokens are recognised; other errors are not', () => {
  const unregistered = { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } };
  assert.equal(isUnregisteredError(404, unregistered), true);
  assert.equal(isUnregisteredError(400, { error: { message: 'The registration token is not a valid FCM registration token' } }), true);
  assert.equal(isUnregisteredError(400, { error: { message: 'Invalid JSON payload' } }), false);
  assert.equal(isUnregisteredError(500, {}), false);
  assert.equal(isUnregisteredError(429, {}), false);
});

check('send: one token request, then a high-priority data message in the v1 shape', async () => {
  const fake = fakeFetch();
  const fcm = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: fake.fetchImpl, now: () => 1_800_000_000_000 });
  const result = await fcm.send({ token: 'device-token-1', data: { type: 'incoming_call', n: 2 }, ttlSeconds: 44.6 });
  assert.deepEqual(result, { ok: true });
  assert.equal(fake.calls.length, 2);

  const tokenCall = fake.calls[0];
  assert.equal(tokenCall.init.method, 'POST');
  const form = new URLSearchParams(tokenCall.init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(form.get('assertion').split('.').length, 3);

  const sendCall = fake.calls[1];
  assert.equal(sendCall.url, 'https://fcm.googleapis.com/v1/projects/internal-comms-test/messages:send');
  assert.equal(sendCall.init.headers.Authorization, 'Bearer access-1');
  assert.deepEqual(JSON.parse(sendCall.init.body), {
    message: {
      token: 'device-token-1',
      data: { type: 'incoming_call', n: '2' },
      android: { priority: 'HIGH', ttl: '44s' },
    },
  });
});

check('access token is cached and refreshed shortly before it expires', async () => {
  let clock = 1_800_000_000_000;
  const fake = fakeFetch({ tokenLifetime: 3600 });
  const fcm = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: fake.fetchImpl, now: () => clock });
  await fcm.send({ token: 't', data: {} });
  clock += 30 * 60 * 1000;
  await fcm.send({ token: 't', data: {} });
  assert.equal(fake.tokenRequests(), 1, 'reused after 30 minutes');
  clock += 26 * 60 * 1000; // 56 minutes in: inside the 5-minute margin
  await fcm.send({ token: 't', data: {} });
  assert.equal(fake.tokenRequests(), 2, 'refreshed near expiry');
});

check('concurrent sends share one token request', async () => {
  const fake = fakeFetch();
  const fcm = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: fake.fetchImpl });
  await Promise.all([1, 2, 3, 4].map((i) => fcm.send({ token: `t${i}`, data: {} })));
  assert.equal(fake.tokenRequests(), 1);
});

check('401 refreshes the access token and retries once', async () => {
  const fake = fakeFetch({ sendStatuses: [{ status: 401 }, { status: 200 }] });
  const fcm = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: fake.fetchImpl });
  assert.deepEqual(await fcm.send({ token: 't', data: {} }), { ok: true });
  assert.equal(fake.tokenRequests(), 2);

  const always401 = fakeFetch({ sendStatuses: [{ status: 401 }, { status: 401 }] });
  const fcm2 = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: always401.fetchImpl });
  const result = await fcm2.send({ token: 't', data: {} });
  assert.equal(result.ok, false);
  assert.equal(result.unregistered, false);
});

check('an uninstalled app is reported as unregistered; a server error is not', async () => {
  const gone = fakeFetch({ sendStatuses: [{ status: 404, body: { error: { details: [{ errorCode: 'UNREGISTERED' }] } } }] });
  const fcm = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: gone.fetchImpl });
  assert.deepEqual(await fcm.send({ token: 't', data: {} }), { ok: false, unregistered: true, status: 404 });

  const busy = fakeFetch({ sendStatuses: [{ status: 503 }] });
  const fcm2 = createFcmClient({ serviceAccount: SERVICE_ACCOUNT, fetchImpl: busy.fetchImpl });
  assert.deepEqual(await fcm2.send({ token: 't', data: {} }), { ok: false, unregistered: false, status: 503 });
});

// ---- callPush.js --------------------------------------------------------------

const NOW = 1_800_000_000_000;
const ringingViews = (overrides = {}) => ({
  callId: 'call-1',
  callerEmployeeId: 'emp-caller',
  calleeEmployeeId: 'emp-callee',
  status: 'ringing',
  relayOnly: false,
  caller: { caller: { name: 'المتصل' }, callee: { name: 'المستقبل' } },
  callee: { redacted: false, caller: { name: 'علي', nameEn: 'Ali' }, callee: { name: 'أحمد' } },
  ...overrides,
});

function setupNotifier(options = {}) {
  const sent = [];
  let ids = 0;
  const notify = createCallPushNotifier({
    sendToEmployee: async (employeeId, data, opts) => sent.push({ employeeId, data, opts }),
    ringTimeoutSeconds: 45,
    now: () => NOW,
    newEventId: () => `00000000-0000-4000-8000-00000000000${(ids += 1)}`,
    ...options,
  });
  return { notify, sent };
}

check('ringing: the callee gets an incomingCall push in expo-callkit-telecom format, no names by default', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews(), { ringExpiresAt: new Date(NOW + 45_000) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].employeeId, 'emp-callee');
  assert.deepEqual(Object.keys(sent[0].data).sort(), ['incomingCall', 'messageType']);
  assert.equal(sent[0].data.messageType, PUSH_TYPES.INCOMING_CALL);
  assert.equal(typeof sent[0].data.incomingCall, 'string', 'FCM data values are strings');
  assert.deepEqual(JSON.parse(sent[0].data.incomingCall), {
    eventId: '00000000-0000-4000-8000-000000000001',
    serverCallId: 'call-1',
    hasVideo: false,
    startedAt: new Date(NOW).toISOString(),
    caller: { id: 'internal-comms', displayName: GENERIC_CALLER_NAME },
    metadata: { expiresAt: new Date(NOW + 45_000).toISOString(), relayOnly: false, redacted: false },
  });
  assert.deepEqual(sent[0].opts, { ttlSeconds: 45 });
  assert.equal(sent[0].data.incomingCall.includes('emp-'), false, 'no employee ids');
});

check('caller name only when enabled, and always the callee view (redaction kept)', async () => {
  const { notify, sent } = setupNotifier({ showCallerName: true });
  await notify(ringingViews());
  const first = JSON.parse(sent[0].data.incomingCall);
  assert.equal(first.caller.displayName, 'علي');
  assert.equal(first.metadata.callerNameEn, 'Ali');

  const leadership = ringingViews({
    callId: 'call-2',
    relayOnly: true,
    callee: { redacted: true, caller: { name: 'مكتب المدير', nameEn: 'Director office' } },
  });
  await notify(leadership);
  const second = JSON.parse(sent[1].data.incomingCall);
  assert.equal(second.caller.displayName, 'مكتب المدير');
  assert.equal(second.caller.id, 'internal-comms', 'caller id never identifies the caller');
  assert.equal(second.metadata.redacted, true);
  assert.equal(second.metadata.relayOnly, true);
  assert.notEqual(first.eventId, second.eventId, 'one event id per ring');
});

check('the same ring published twice pushes once; an expired ring never pushes', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews());
  await notify(ringingViews());
  assert.equal(sent.length, 1);
  await notify(ringingViews({ callId: 'late' }), { ringExpiresAt: new Date(NOW - 1000) });
  assert.equal(sent.length, 1);
});

check('push TTL follows the ring deadline and is capped', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews({ callId: 'a' }), { ringExpiresAt: NOW + 10_500 });
  await notify(ringingViews({ callId: 'b' }), { ringExpiresAt: NOW + 3_600_000 });
  await notify(ringingViews({ callId: 'c' })); // no deadline: ring timeout
  assert.deepEqual(sent.map((s) => s.opts.ttlSeconds), [11, 120, 45]);
});

check('declined / cancelled / missed / ended: every callee phone gets callEnded', async () => {
  const expected = { rejected: 'declinedElsewhere', cancelled: 'remoteEnded', missed: 'unanswered', ended: 'remoteEnded' };
  for (const [status, reason] of Object.entries(expected)) {
    const { notify, sent } = setupNotifier();
    await notify(ringingViews());
    await notify(ringingViews({ status }));
    assert.equal(sent.length, 2, status);
    assert.equal(sent[1].employeeId, 'emp-callee');
    assert.equal(sent[1].data.messageType, PUSH_TYPES.CALL_ENDED);
    assert.deepEqual(JSON.parse(sent[1].data.callEnded), {
      eventId: '00000000-0000-4000-8000-000000000002',
      serverCallId: 'call-1',
      reason,
    });
    assert.equal(sent[1].opts.excludeTokens, undefined, `${status}: no phone excluded`);
    // only once
    await notify(ringingViews({ status: 'ended' }));
    assert.equal(sent.length, 2, `${status}: no second stop`);
  }
});

check('answered: callEnded skips the phone that answered (it would hang it up)', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews());
  await notify(ringingViews({ status: 'accepted' }), { answeringToken: 'answering-phone-token-123456' });
  assert.equal(sent.length, 2);
  assert.equal(JSON.parse(sent[1].data.callEnded).reason, 'answeredElsewhere');
  assert.deepEqual(sent[1].opts.excludeTokens, ['answering-phone-token-123456']);
});

check('answered without the answering token: no callEnded at all (never risk hanging up)', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews());
  await notify(ringingViews({ status: 'accepted' }));
  assert.equal(sent.length, 1);
  await notify(ringingViews({ status: 'ended' }));
  assert.equal(sent.length, 1, 'the ring is forgotten once answered');
});

check('every end reason maps to one the module knows', () => {
  const known = new Set(['failed', 'remoteEnded', 'unanswered', 'answeredElsewhere', 'declinedElsewhere', 'unknown']);
  for (const reason of Object.values(END_REASONS)) assert.equal(known.has(reason), true, reason);
  assert.equal(JSON.parse(callEndedData({ callId: 'x', status: 'weird' }, { eventId: 'e' }).callEnded).reason, 'unknown');
});

check('busy and calls that never rang push nothing', async () => {
  const { notify, sent } = setupNotifier();
  await notify(ringingViews({ status: 'busy' }));
  await notify(ringingViews({ callId: 'never-rang', status: 'ended' }));
  await notify(null);
  await notify({ callId: 'x' });
  assert.equal(sent.length, 0);
});

check('incomingCallData never reads the caller-side view', () => {
  const data = incomingCallData(
    ringingViews({ caller: { caller: { name: 'SECRET' } }, callee: { redacted: true, caller: { name: 'Label' } } }),
    { expiresAtMs: NOW, showCallerName: true, eventId: 'e', startedAtMs: NOW }
  );
  assert.equal(JSON.stringify(data).includes('SECRET'), false);
});

check('the accept handler forwards only a well-formed push token', () => {
  const source = fs.readFileSync(path.join(backendRoot, 'src/modules/calls/signaling/signaling.server.js'), 'utf8');
  assert.match(source, /answeringToken: event === 'call:accept' \? pushTokenFrom\(payload\) : null/);
  assert.match(source, /\^\[A-Za-z0-9_:\\-\.\]\{20,512\}\$/);
});

// ---- wiring (source checks) ---------------------------------------------------

check('the call fan-out pushes in the background, after the socket events', () => {
  const source = fs.readFileSync(path.join(backendRoot, 'src/modules/calls/signaling/signaling.server.js'), 'utf8');
  assert.match(source, /createCallPushNotifier\(/);
  assert.match(source, /Promise\.resolve\(\)\s*\.then\(\(\) => state\?\.notifyPush\?\.\(views/);
  assert.match(source, /ringExpiresAt: loaded\.call\.ringExpiresAt/);
});

check('push routes require sign-in and validate the body', () => {
  const source = fs.readFileSync(path.join(backendRoot, 'src/modules/push/push.routes.js'), 'utf8');
  assert.match(source, /router\.post\('\/tokens', authenticate, validate\(registerPushTokenSchema\)/);
  assert.match(source, /router\.delete\('\/tokens', authenticate, validate\(unregisterPushTokenSchema\)/);
  const index = fs.readFileSync(path.join(backendRoot, 'src/routes/index.js'), 'utf8');
  assert.match(index, /router\.use\('\/push', pushRoutes\)/);
});

check('push code never logs tokens or credentials', () => {
  for (const file of ['fcm.js', 'push.service.js', 'callPush.js']) {
    const source = fs.readFileSync(path.join(backendRoot, 'src/modules/push', file), 'utf8');
    const logs = source.split('\n').filter((line) => /console\.\w+\(/.test(line));
    for (const line of logs) {
      assert.equal(/token|private|assertion|data\b|account\b/i.test(line.replace(/'[^']*'/g, '')), false, `${file}: ${line.trim()}`);
    }
  }
});

check('the service-account folder is git-ignored', () => {
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^backend\/secrets\/$/m);
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

console.log(`\n[test:push] ${passed} checks passed`);
