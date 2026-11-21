/**
 * Decline from a closed app (Phase D).
 *
 * Ring pushes carry `declineUrl` + `declineToken` (see declineToken.js). When
 * the callee declines on the phone's own call screen while the app is closed,
 * the app's native receiver posts them here, without a sign-in, and the call
 * is declined exactly as if the app had sent `call:reject`.
 */
import { env } from '../../config/env.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import * as callService from '../calls/call.service.js';
import { createDeclineSigner, deriveDeclineKey } from './declineToken.js';
import { pickLanAddress } from './lanAddress.js';

export const DECLINE_PATH = '/api/push/decline';

let signer = null;
function getSigner() {
  if (!signer) signer = createDeclineSigner({ key: deriveDeclineKey(env.jwt.privateKey) });
  return signer;
}

/**
 * Where phones reach this server: PUSH_PUBLIC_API_URL, or in development the
 * LAN address found automatically (no setting needed while the IP changes).
 * Production must set PUSH_PUBLIC_API_URL (the public https address).
 */
export function publicBaseUrl() {
  if (env.push.publicApiUrl) return env.push.publicApiUrl;
  if (env.isProduction) return null;
  const address = pickLanAddress();
  return address ? `http://${address}:${env.port}` : null;
}

/**
 * Decline link for one ring push, or null when no address is known (the phone
 * then just stops ringing at its timeout, as before).
 */
export function buildDeclineLink({ callId, employeeId, expiresAtMs }) {
  const base = publicBaseUrl();
  if (!base || !env.jwt.privateKey) return null;
  return {
    url: `${base}${DECLINE_PATH}`,
    token: getSigner().sign({ callId, employeeId, expiresAtMs }),
  };
}

function invalidLink() {
  // Same answer for an unknown call and a bad token.
  return new AppError(403, ErrorCodes.CALL_FORBIDDEN, 'رابط الرفض غير صالح.');
}

/**
 * @returns {Promise<{declined: boolean}>} declined=false when the ring had
 *   already ended (answered, cancelled, missed): nothing to do.
 */
export async function declineFromPush({ callId, token }, ctx = {}) {
  const loaded = await callService.loadCallById(callId);
  const calleeEmployeeId = loaded?.call?.calleeEmployeeId;
  if (!calleeEmployeeId || !getSigner().verify({ callId, employeeId: calleeEmployeeId, token })) {
    throw invalidLink();
  }
  if (loaded.call.status !== 'ringing') return { declined: false };

  try {
    await callService.declineCall(callId, calleeEmployeeId, {
      actorUserId: null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  } catch (err) {
    // Answered or cancelled in the same moment.
    if (err?.code === ErrorCodes.CALL_INVALID_STATE) return { declined: false };
    throw err;
  }
  return { declined: true };
}
