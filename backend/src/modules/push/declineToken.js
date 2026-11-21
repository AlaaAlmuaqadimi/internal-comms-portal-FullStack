/**
 * Decline links for ring pushes (Phase D).
 *
 * When the app is closed, Android shows the incoming call natively and no
 * JavaScript runs. If the callee declines there, a small native receiver in
 * the app posts `{ callId, token }` to the server so the caller stops ringing
 * at once instead of waiting for the ring timeout.
 *
 * The token is an HMAC over the call id, the callee's employee id and an
 * expiry, so it only ever declines that one ringing call for that callee and
 * stops working when the ring ends. It needs no sign-in on the phone.
 *
 * Pure: unit tested in `scripts/push-test.js`.
 */
import crypto from 'node:crypto';

const SIGNING_LABEL = 'internal-comms:push-decline:v1';
// A little slack after the ring deadline for slow networks.
const GRACE_MS = 15_000;
const TOKEN_PATTERN = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/;

/** A dedicated key derived from a server secret (e.g. the JWT signing key). */
export function deriveDeclineKey(secret) {
  if (!secret) throw new Error('deriveDeclineKey requires a secret');
  return crypto.createHmac('sha256', String(secret)).update(SIGNING_LABEL).digest();
}

/**
 * @param {object} deps
 * @param {Buffer|string} deps.key   From deriveDeclineKey
 * @param {() => number} [deps.now]
 */
export function createDeclineSigner({ key, now = () => Date.now() }) {
  if (!key) throw new Error('createDeclineSigner requires a key');

  const mac = (callId, employeeId, expiresAtMs) =>
    crypto
      .createHmac('sha256', key)
      .update(`${callId}|${employeeId}|${expiresAtMs}`)
      .digest('base64url');

  return {
    /** Token valid until the ring deadline (plus a short grace). */
    sign({ callId, employeeId, expiresAtMs }) {
      const expiry = Math.floor(Number(expiresAtMs) + GRACE_MS);
      return `${expiry}.${mac(callId, employeeId, expiry)}`;
    },

    /** True only for an unexpired token minted for this call and callee. */
    verify({ callId, employeeId, token }) {
      const match = TOKEN_PATTERN.exec(String(token || ''));
      if (!match || !callId || !employeeId) return false;
      const expiry = Number(match[1]);
      if (!Number.isFinite(expiry) || expiry < now()) return false;
      const expected = Buffer.from(mac(callId, employeeId, expiry));
      const given = Buffer.from(match[2]);
      return expected.length === given.length && crypto.timingSafeEqual(expected, given);
    },
  };
}
