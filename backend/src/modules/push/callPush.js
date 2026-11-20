/**
 * Incoming-call pushes (Phase D).
 *
 * When a call starts ringing, every phone of the callee gets a data-only FCM
 * message so the app can show the incoming-call screen even when it is closed.
 * When the ring ends (answered, declined, cancelled, missed, ended), the
 * callee's phones get a `call_stop` so a ring on another phone stops too.
 *
 * Privacy: the push goes through Google. By default it carries only the call
 * id and the ring deadline; the caller's name is added only when
 * PUSH_SHOW_CALLER_NAME=true, and then it is the callee's view of the name, so
 * a leadership caller still shows only the redacted label.
 *
 * Pure apart from the injected sender: unit tested in `scripts/push-test.js`.
 */

export const PUSH_TYPES = Object.freeze({
  INCOMING_CALL: 'incoming_call',
  CALL_STOP: 'call_stop',
});

const RING_STATUSES = new Set(['ringing']);
const TERMINAL_OR_ANSWERED = new Set(['accepted', 'rejected', 'cancelled', 'missed', 'ended', 'failed']);
// Push TTL never exceeds this, whatever the ring deadline says.
const MAX_TTL_SECONDS = 120;

/** Data for the "your phone is ringing" push, all values strings. */
export function incomingCallData(views, { expiresAtMs, showCallerName = false }) {
  const data = {
    type: PUSH_TYPES.INCOMING_CALL,
    callId: String(views.callId),
    expiresAt: new Date(expiresAtMs).toISOString(),
    relayOnly: views.relayOnly ? '1' : '0',
  };
  if (showCallerName) {
    const caller = views.callee?.caller || {};
    if (caller.name) data.callerName = String(caller.name);
    if (caller.nameEn) data.callerNameEn = String(caller.nameEn);
    if (views.callee?.redacted) data.redacted = '1';
  }
  return data;
}

export function callStopData(views) {
  return {
    type: PUSH_TYPES.CALL_STOP,
    callId: String(views.callId),
    status: String(views.status),
  };
}

/**
 * @param {object} deps
 * @param {(employeeId: string, data: object, opts: {ttlSeconds: number}) => Promise<unknown>} deps.sendToEmployee
 * @param {number} deps.ringTimeoutSeconds
 * @param {boolean} [deps.showCallerName]
 * @param {() => number} [deps.now]
 * @returns {(views: object, opts?: {ringExpiresAt?: Date|string|number|null}) => Promise<void>}
 */
export function createCallPushNotifier({ sendToEmployee, ringTimeoutSeconds, showCallerName = false, now = () => Date.now() }) {
  // Calls we sent a ring push for, so only those get a stop push. Bounded.
  const rung = new Map(); // callId -> calleeEmployeeId
  const MAX_TRACKED = 1000;

  const remember = (callId, employeeId) => {
    if (rung.size >= MAX_TRACKED) rung.delete(rung.keys().next().value);
    rung.set(callId, employeeId);
  };

  return async function notify(views, { ringExpiresAt = null } = {}) {
    if (!views?.callId || !views.calleeEmployeeId) return;

    if (RING_STATUSES.has(views.status)) {
      if (rung.has(views.callId)) return; // a re-publish of the same ring
      const parsed = ringExpiresAt ? new Date(ringExpiresAt).getTime() : NaN;
      const expiresAtMs = Number.isFinite(parsed) ? parsed : now() + ringTimeoutSeconds * 1000;
      const ttlSeconds = Math.min(MAX_TTL_SECONDS, Math.max(0, Math.ceil((expiresAtMs - now()) / 1000)));
      if (ttlSeconds <= 0) return; // already expired: never ring late
      remember(views.callId, views.calleeEmployeeId);
      await sendToEmployee(views.calleeEmployeeId, incomingCallData(views, { expiresAtMs, showCallerName }), {
        ttlSeconds,
      });
      return;
    }

    if (TERMINAL_OR_ANSWERED.has(views.status) && rung.has(views.callId)) {
      const employeeId = rung.get(views.callId);
      rung.delete(views.callId);
      await sendToEmployee(employeeId, callStopData(views), { ttlSeconds: 60 });
    }
  };
}
