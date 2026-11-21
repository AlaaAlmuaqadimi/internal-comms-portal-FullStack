/**
 * APNs VoIP sender (Phase D, iPhone).
 *
 * iPhones get the incoming-call push through Apple's servers as a PushKit
 * VoIP push. expo-callkit-telecom parses it natively and shows CallKit before
 * any JavaScript runs, so a closed app still rings.
 *
 * Token auth: a .p8 signing key from the Apple Developer account (Keys ->
 * Apple Push Notifications service). The key is a secret: keep it on the
 * server only (the default location `backend/secrets/` is git-ignored).
 * Uses node:http2 directly, no extra dependency.
 *
 * Apple's rules that shape this file:
 * - topic `<bundle id>.voip`, header `apns-push-type: voip`, priority 10;
 * - every VoIP push MUST end in a CallKit call on the phone, so only ring
 *   pushes go here, never "stop ringing" pushes (callPush.js sends none);
 * - the provider token (ES256 JWT) is reused for 20-60 minutes.
 *
 * Pure apart from the network: unit tested in `scripts/push-test.js`.
 */
import crypto from 'node:crypto';
import http2 from 'node:http2';

export const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

// Apple accepts a provider token for 60 minutes; renew well before.
const TOKEN_LIFETIME_MS = 45 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
// A device token is 64 hex chars today; allow longer, refuse junk.
const DEVICE_TOKEN = /^[0-9a-fA-F]{64,200}$/;

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Validates the .p8 key and the ids; throws a message naming what is wrong (never the key). */
export function parseApnsKey({ keyPem, keyId, teamId }) {
  if (!keyId || !/^[A-Z0-9]{10}$/.test(String(keyId))) throw new Error('APNS_KEY_ID must be the 10-character key id');
  if (!teamId || !/^[A-Z0-9]{10}$/.test(String(teamId))) throw new Error('APNS_TEAM_ID must be the 10-character team id');
  let key;
  try {
    key = crypto.createPrivateKey(String(keyPem || ''));
  } catch {
    throw new Error('the APNs key file is not a valid .p8 private key');
  }
  if (key.asymmetricKeyType !== 'ec') throw new Error('the APNs key must be an EC (ES256) key');
  return { key, keyId: String(keyId), teamId: String(teamId) };
}

/** ES256 provider token (JWT) for APNs. */
export function buildProviderToken({ key, keyId, teamId }, nowMs) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(nowMs / 1000) }));
  const signature = crypto
    .sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/**
 * Apple's answer for a token that will never work again (app removed).
 * BadDeviceToken / DeviceTokenNotForTopic usually mean a server setting is
 * wrong (sandbox vs production, bundle id), so those tokens are kept.
 */
export function isUnregisteredResponse(status, reason) {
  return status === 410 || reason === 'Unregistered';
}

/**
 * @param {object} deps
 * @param {{key: crypto.KeyObject, keyId: string, teamId: string}} deps.credentials  From parseApnsKey
 * @param {string} deps.bundleId       e.g. ly.call.comms (topic becomes ly.call.comms.voip)
 * @param {boolean} [deps.production]  false: sandbox (development builds)
 * @param {typeof http2.connect} [deps.connect]
 * @param {() => number} [deps.now]
 */
export function createApnsClient({ credentials, bundleId, production = false, connect = http2.connect, now = () => Date.now() }) {
  if (!credentials?.key) throw new Error('createApnsClient requires credentials');
  if (!bundleId) throw new Error('createApnsClient requires a bundle id');
  const origin = production ? APNS_HOSTS.production : APNS_HOSTS.sandbox;
  const topic = `${bundleId}.voip`;

  let cached = null; // { token, issuedAt }
  let session = null;

  const providerToken = (force = false) => {
    const t = now();
    if (force || !cached || t - cached.issuedAt > TOKEN_LIFETIME_MS) {
      cached = { token: buildProviderToken(credentials, t), issuedAt: t };
    }
    return cached.token;
  };

  const getSession = () => {
    if (session && !session.closed && !session.destroyed) return session;
    session = connect(origin);
    // A broken connection is replaced on the next send; never crash the server.
    session.on('error', () => {
      session = null;
    });
    session.on('goaway', () => {
      session = null;
    });
    session.unref?.();
    return session;
  };

  const request = ({ token, body, expirationSeconds, force }) =>
    new Promise((resolve) => {
      let stream;
      try {
        stream = getSession().request({
          ':method': 'POST',
          ':path': `/3/device/${token}`,
          authorization: `bearer ${providerToken(force)}`,
          'apns-topic': topic,
          'apns-push-type': 'voip',
          'apns-priority': '10',
          'apns-expiration': String(expirationSeconds),
          'content-type': 'application/json',
        });
      } catch {
        session = null;
        resolve({ status: 0, reason: 'ConnectionFailed' });
        return;
      }
      let status = 0;
      let text = '';
      const timer = setTimeout(() => {
        stream.close?.(http2.constants?.NGHTTP2_CANCEL);
        resolve({ status: 0, reason: 'Timeout' });
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      stream.on('response', (headers) => {
        status = Number(headers[':status']) || 0;
      });
      stream.setEncoding?.('utf8');
      stream.on('data', (chunk) => {
        if (text.length < 2000) text += chunk;
      });
      stream.on('end', () => {
        clearTimeout(timer);
        let reason = '';
        try {
          reason = text ? JSON.parse(text).reason || '' : '';
        } catch {
          reason = '';
        }
        resolve({ status, reason });
      });
      stream.on('error', () => {
        clearTimeout(timer);
        session = null;
        resolve({ status: 0, reason: 'StreamError' });
      });
      stream.end(body);
    });

  return {
    topic,
    origin,

    /**
     * @param {{token: string, payload: object, ttlSeconds?: number}} msg
     * @returns {Promise<{ok: boolean, unregistered: boolean, status: number, reason: string}>}
     */
    async send({ token, payload, ttlSeconds = 60 }) {
      if (!DEVICE_TOKEN.test(String(token || ''))) {
        return { ok: false, unregistered: true, status: 0, reason: 'BadDeviceToken' };
      }
      const body = JSON.stringify(payload);
      const expirationSeconds = Math.floor(now() / 1000) + Math.max(0, Math.floor(ttlSeconds));
      let res = await request({ token, body, expirationSeconds, force: false });
      if (res.status === 403 && res.reason === 'ExpiredProviderToken') {
        res = await request({ token, body, expirationSeconds, force: true });
      }
      return {
        ok: res.status === 200,
        unregistered: isUnregisteredResponse(res.status, res.reason),
        status: res.status,
        reason: res.reason,
      };
    },

    close() {
      session?.close?.();
      session = null;
    },
  };
}
