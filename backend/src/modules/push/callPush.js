/**
 * Incoming-call pushes (Phase D).
 *
 * When a call starts ringing, every phone of the callee gets a data-only FCM
 * message so the app can show the incoming-call screen even when it is closed.
 * When the ring ends (answered, declined, cancelled, missed, ended), the
 * callee's phones get a `callEnded` so a ring on another phone stops too.
 * The module ends the call natively WITHOUT checking its state, so after an
 * answer the phone that answered is excluded (its push token comes with the
 * accept).
 *
 * Privacy: the push goes through Google. By default it carries only the call
 * id and the ring deadline; the caller's name is added only when
 * PUSH_SHOW_CALLER_NAME=true, and then it is the callee's view of the name, so
 * a leadership caller still shows only the redacted label.
 *
 * Wire format: the app uses expo-callkit-telecom, which parses FCM data
 * messages natively (before JS runs) when `messageType` is `incomingCall` and
 * `incomingCall` holds the JSON-encoded event (FCM data values must be
 * strings). `callEnded` is consumed the same way and dismisses the ring.
 *
 * Pure apart from the injected sender: unit tested in `scripts/push-test.js`.
 */
import crypto from 'node:crypto';

export const PUSH_TYPES = Object.freeze({
  INCOMING_CALL: 'incomingCall', // expo-callkit-telecom's messageTypes
  CALL_ENDED: 'callEnded',
  // Ours: the module passes unknown types on to expo-notifications.
  MISSED_CALL: 'missedCall',
});

/** Our call status -> the module's CallEndedReason. */
export const END_REASONS = Object.freeze({
  accepted: 'answeredElsewhere',
  rejected: 'declinedElsewhere',
  cancelled: 'remoteEnded',
  missed: 'unanswered',
  ended: 'remoteEnded',
  failed: 'failed',
});

// Shown by the system call screen when the caller's name is not sent.
export const GENERIC_CALLER_NAME = 'مكالمة داخلية';

const RING_STATUSES = new Set(['ringing']);
const TERMINAL_OR_ANSWERED = new Set(['accepted', 'rejected', 'cancelled', 'missed', 'ended', 'failed']);
// Push TTL never exceeds this, whatever the ring deadline says.
const MAX_TTL_SECONDS = 120;

/**
 * The incoming-call event in expo-callkit-telecom's format.
 *
 * `caller.id` must be stable and opaque; an employee id would identify a
 * redacted leadership caller, so it is a fixed value. The real caller is
 * fetched from our server (call:sync) once the app runs.
 */
export function incomingCallEvent(views, { expiresAtMs, showCallerName = false, eventId, startedAtMs, decline = null }) {
  const caller = views.callee?.caller || {};
  const displayName = showCallerName && caller.name ? String(caller.name) : GENERIC_CALLER_NAME;
  return {
    eventId,
    serverCallId: String(views.callId),
    hasVideo: false,
    startedAt: new Date(startedAtMs).toISOString(),
    caller: { id: 'internal-comms', displayName },
    metadata: {
      expiresAt: new Date(expiresAtMs).toISOString(),
      relayOnly: Boolean(views.relayOnly),
      redacted: Boolean(views.callee?.redacted),
      ...(showCallerName && caller.nameEn ? { callerNameEn: String(caller.nameEn) } : {}),
      // Lets the app's native receiver decline while no JS runs (app closed).
      ...(decline?.url && decline?.token
        ? { declineUrl: String(decline.url), declineToken: String(decline.token) }
        : {}),
    },
  };
}

/** FCM data for the "your phone is ringing" push, all values strings. */
export function incomingCallData(views, options) {
  return incomingCallFcmData(incomingCallEvent(views, options));
}

function incomingCallFcmData(event) {
  return { messageType: PUSH_TYPES.INCOMING_CALL, incomingCall: JSON.stringify(event) };
}

/**
 * APNs VoIP payload for the same ring: the event as an object under
 * `incomingCall` (iOS rejects the FCM JSON-string form).
 */
export function incomingCallApnsPayload(event) {
  return { incomingCall: event };
}

/** Dismisses a ringing call on the phone (unique eventId per push). */
export function callEndedData(views, { eventId }) {
  return {
    messageType: PUSH_TYPES.CALL_ENDED,
    callEnded: JSON.stringify({
      eventId,
      serverCallId: String(views.callId),
      reason: END_REASONS[views.status] || 'unknown',
    }),
  };
}

// Android notification channel for missed calls; the app creates it with
// this id (mobile/src/services/deviceNotifications.js).
export const MISSED_CALL_CHANNEL = 'missed-calls';
// A phone that was off still shows the missed call when it comes back.
export const MISSED_CALL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Missed-call entry for the phone's notification shade (Android). Generic
 * unless PUSH_SHOW_CALLER_NAME is on; then the callee-side name (redaction
 * kept), never the caller-side view.
 */
export function missedCallPush(views, { showCallerName = false } = {}) {
  const caller = views.callee?.caller || {};
  const name = showCallerName && caller.name ? String(caller.name) : '';
  return {
    data: { messageType: PUSH_TYPES.MISSED_CALL, callId: String(views.callId) },
    notification: {
      title: 'مكالمة فائتة',
      body: name ? `فاتتك مكالمة من ${name}` : 'فاتتك مكالمة داخلية. افتح التطبيق للتفاصيل.',
      channelId: MISSED_CALL_CHANNEL,
      tag: `missed-${views.callId}`,
    },
  };
}

/**
 * @param {object} deps
 * @param {(employeeId: string, data: object, opts: {ttlSeconds: number, apns?: object, excludeTokens?: string[]}) => Promise<unknown>} deps.sendToEmployee
 *   `data` goes to Android (FCM); `opts.apns`, when present, to iPhones (APNs
 *   VoIP). Stop pushes carry no `apns`: a VoIP push must always ring.
 * @param {number} deps.ringTimeoutSeconds
 * @param {boolean} [deps.showCallerName]
 * @param {() => number} [deps.now]
 * @param {() => string} [deps.newEventId]  UUID per ring push (dedup on the phone)
 * @param {(ring: {callId: string, employeeId: string, expiresAtMs: number}) => ({url: string, token: string}|null)} [deps.declineLink]
 *   Optional decline link for the ring push (see declineToken.js).
 * @returns {(views: object, opts?: {ringExpiresAt?: Date|string|number|null, answeringToken?: string|null}) => Promise<void>}
 */
export function createCallPushNotifier({
  sendToEmployee,
  ringTimeoutSeconds,
  showCallerName = false,
  now = () => Date.now(),
  newEventId = () => crypto.randomUUID(),
  declineLink = null,
}) {
  // Calls we sent a ring push for, so only those get a stop push. Bounded.
  const rung = new Map(); // callId -> calleeEmployeeId
  const MAX_TRACKED = 1000;

  const remember = (callId, employeeId) => {
    if (rung.size >= MAX_TRACKED) rung.delete(rung.keys().next().value);
    rung.set(callId, employeeId);
  };

  return async function notify(views, { ringExpiresAt = null, answeringToken = null } = {}) {
    if (!views?.callId || !views.calleeEmployeeId) return;

    if (RING_STATUSES.has(views.status)) {
      if (rung.has(views.callId)) return; // a re-publish of the same ring
      const parsed = ringExpiresAt ? new Date(ringExpiresAt).getTime() : NaN;
      const expiresAtMs = Number.isFinite(parsed) ? parsed : now() + ringTimeoutSeconds * 1000;
      const ttlSeconds = Math.min(MAX_TTL_SECONDS, Math.max(0, Math.ceil((expiresAtMs - now()) / 1000)));
      if (ttlSeconds <= 0) return; // already expired: never ring late
      remember(views.callId, views.calleeEmployeeId);
      let decline = null;
      try {
        decline = declineLink?.({
          callId: String(views.callId),
          employeeId: String(views.calleeEmployeeId),
          expiresAtMs,
        }) || null;
      } catch {
        decline = null; // the ring matters more than the link
      }
      const event = incomingCallEvent(views, {
        expiresAtMs,
        showCallerName,
        eventId: newEventId(),
        startedAtMs: now(),
        decline,
      });
      await sendToEmployee(views.calleeEmployeeId, incomingCallFcmData(event), {
        ttlSeconds,
        apns: incomingCallApnsPayload(event),
      });
      return;
    }

    if (TERMINAL_OR_ANSWERED.has(views.status) && rung.has(views.callId)) {
      const employeeId = rung.get(views.callId);
      rung.delete(views.callId);
      const options = { ttlSeconds: 60 };
      if (views.status === 'accepted') {
        // Never hang up the phone that answered. Without its token we cannot
        // tell the phones apart, so we send nothing: the other phones stop on
        // the socket event, or at the module's ring timeout if closed.
        if (!answeringToken) return;
        options.excludeTokens = [answeringToken];
      }
      await sendToEmployee(employeeId, callEndedData(views, { eventId: newEventId() }), options);
      if (views.status === 'missed') {
        // The ring screen just vanished: leave a trace in the shade (Android;
        // iPhone needs a separate alert token, not the VoIP one).
        const missed = missedCallPush(views, { showCallerName });
        await sendToEmployee(employeeId, missed.data, {
          ttlSeconds: MISSED_CALL_TTL_SECONDS,
          notification: missed.notification,
        });
      }
    }
  };
}
