/**
 * Minimal Firebase Cloud Messaging (HTTP v1) client.
 *
 * No firebase-admin dependency: a service account signs a short JWT, Google
 * exchanges it for an OAuth access token (cached ~1 hour), and each message is
 * one POST to `fcm.googleapis.com`. `fetch` and the clock are injected so the
 * module is unit tested without network (`scripts/push-test.js`).
 *
 * Never logs tokens, credentials or payloads.
 */
import crypto from 'node:crypto';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const ASSERTION_LIFETIME_SECONDS = 3600;
// Refresh the access token this long before Google says it expires.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const base64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

/** Checks the fields we need from a Google service-account JSON file. */
export function parseServiceAccount(value) {
  const account = typeof value === 'string' ? JSON.parse(value) : value;
  const missing = ['project_id', 'client_email', 'private_key'].filter(
    (key) => typeof account?.[key] !== 'string' || account[key].trim() === ''
  );
  if (missing.length > 0) {
    throw new Error(`FCM service account is missing: ${missing.join(', ')}`);
  }
  return {
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key.replace(/\\n/g, '\n'),
    tokenUri: account.token_uri || DEFAULT_TOKEN_URI,
  };
}

/** The signed JWT Google exchanges for an access token (RS256). */
export function buildAssertion(account, nowMs) {
  const iat = Math.floor(nowMs / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const claims = base64url({
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: account.tokenUri,
    iat,
    exp: iat + ASSERTION_LIFETIME_SECONDS,
  });
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(account.privateKey)
    .toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/** FCM `data` values must all be strings. */
export function toDataPayload(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

/**
 * True when FCM says the token will never work again (app uninstalled, token
 * rotated): the row should be deleted.
 */
export function isUnregisteredError(status, body) {
  const error = body?.error;
  const codes = (error?.details || []).map((d) => d?.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED')) return true;
  if (status === 404) return true;
  if (status === 400 && /registration token/i.test(error?.message || '')) return true;
  return false;
}

/**
 * @param {object} options
 * @param {object} options.serviceAccount  Parsed with parseServiceAccount (or raw JSON)
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 */
export function createFcmClient({ serviceAccount, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const account = serviceAccount?.privateKey ? serviceAccount : parseServiceAccount(serviceAccount);
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available (Node 18+ required)');

  const sendUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`;
  let cached = null; // { token, expiresAt }
  let pending = null;

  async function fetchAccessToken() {
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildAssertion(account, now()),
    });
    const res = await fetchImpl(account.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || typeof json.access_token !== 'string') {
      throw new Error(`FCM auth failed (${res.status})`);
    }
    const lifetimeMs = Number(json.expires_in || 3600) * 1000;
    cached = { token: json.access_token, expiresAt: now() + lifetimeMs };
    return cached.token;
  }

  async function accessToken({ force = false } = {}) {
    if (!force && cached && now() < cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }
    // One token request at a time, shared by concurrent sends.
    if (!pending) {
      pending = fetchAccessToken().finally(() => {
        pending = null;
      });
    }
    return pending;
  }

  /**
   * Sends one data-only, high-priority message.
   *
   * @returns {Promise<{ok: true} | {ok: false, unregistered: boolean, status: number}>}
   */
  async function send({ token, data, ttlSeconds = 60 }) {
    const message = {
      message: {
        token,
        data: toDataPayload(data),
        android: { priority: 'HIGH', ttl: `${Math.max(0, Math.floor(ttlSeconds))}s` },
      },
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const bearer = await accessToken({ force: attempt > 0 });
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchImpl(sendUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (res.ok) return { ok: true };
      if (res.status === 401 && attempt === 0) continue; // stale access token
      // eslint-disable-next-line no-await-in-loop
      const body = await res.json().catch(() => ({}));
      return { ok: false, unregistered: isUnregisteredError(res.status, body), status: res.status };
    }
    return { ok: false, unregistered: false, status: 401 };
  }

  return { send, projectId: account.projectId };
}

export default createFcmClient;
