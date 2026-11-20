/**
 * Pure call state machine for the mobile app.
 *
 * No React Native, socket or network import: it is unit tested with plain
 * Node (`npm run test:calls` in mobile/).
 *
 * Phases:
 *   idle -> outgoing -> connecting -> active -> ended -> idle
 *   idle -> incoming -> connecting -> active -> ended -> idle
 *
 * `connecting` is the gap between "the call was accepted" and "audio is
 * flowing". In a build without WebRTC (Expo Go) the provider moves straight
 * from connecting to active.
 *
 * The `call` object is always the server's call view for this user. The UI
 * renders only that view, so a redacted leadership caller stays redacted.
 */

export const PHASES = Object.freeze({
  IDLE: 'idle',
  OUTGOING: 'outgoing',
  INCOMING: 'incoming',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDED: 'ended',
});

export const ENDED_REASONS = Object.freeze({
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  MISSED: 'missed',
  BUSY: 'busy',
  ENDED: 'ended',
  FAILED: 'failed',
  MIC_DENIED: 'micDenied',
  ANSWERED_ELSEWHERE: 'answeredElsewhere',
});

export const initialCallState = Object.freeze({
  phase: PHASES.IDLE,
  call: null,
  acceptedHere: false,
  endedReason: null,
});

const TERMINAL_EVENTS = Object.freeze({
  'call:rejected': ENDED_REASONS.REJECTED,
  'call:cancelled': ENDED_REASONS.CANCELLED,
  'call:missed': ENDED_REASONS.MISSED,
  'call:busy': ENDED_REASONS.BUSY,
  'call:ended': ENDED_REASONS.ENDED,
});

const STATUS_REASONS = Object.freeze({
  rejected: ENDED_REASONS.REJECTED,
  cancelled: ENDED_REASONS.CANCELLED,
  missed: ENDED_REASONS.MISSED,
  busy: ENDED_REASONS.BUSY,
  ended: ENDED_REASONS.ENDED,
  failed: ENDED_REASONS.FAILED,
});

const LIVE_PHASES = new Set([
  PHASES.OUTGOING,
  PHASES.INCOMING,
  PHASES.CONNECTING,
  PHASES.ACTIVE,
]);

/** True while a call occupies the UI (anything but idle / ended). */
export function isLive(state) {
  return LIVE_PHASES.has(state?.phase);
}

function isFree(state) {
  return state.phase === PHASES.IDLE || state.phase === PHASES.ENDED;
}

function sameCall(state, call) {
  return Boolean(state.call?.id && call?.id && state.call.id === call.id);
}

function ended(call, reason) {
  return { phase: PHASES.ENDED, call, acceptedHere: false, endedReason: reason };
}

function onServerEvent(state, event, call) {
  if (!call?.id) return state;

  if (event === 'call:incoming') {
    // One call at a time. The server already answers "busy" to a second
    // caller, so a stray second ring is ignored rather than replacing the call.
    if (!isFree(state)) return state;
    if (call.status !== 'ringing') return state;
    return { phase: PHASES.INCOMING, call, acceptedHere: false, endedReason: null };
  }

  // Every other event only concerns the call we are showing.
  if (!sameCall(state, call)) return state;

  if (event === 'call:accepted') {
    if (state.phase === PHASES.INCOMING && !state.acceptedHere) {
      // Accepted on another device of the same employee.
      return ended(call, ENDED_REASONS.ANSWERED_ELSEWHERE);
    }
    if (state.phase === PHASES.OUTGOING || state.phase === PHASES.CONNECTING) {
      return { ...state, phase: PHASES.CONNECTING, call };
    }
    return { ...state, call };
  }

  const reason = TERMINAL_EVENTS[event];
  if (reason && isLive(state)) {
    return ended(call, reason);
  }

  return state;
}

/**
 * Reconciles local state with the server's list of active calls
 * (`call:sync`), e.g. after a reconnect or when the app returns to the
 * foreground.
 */
function onSync(state, calls) {
  const list = Array.isArray(calls) ? calls : [];

  if (isLive(state)) {
    const current = list.find((call) => call?.id === state.call?.id);
    if (!current) {
      // The server no longer considers it active: it ended while we were away.
      return ended(state.call, ENDED_REASONS.ENDED);
    }
    if (current.status === 'accepted' && state.phase === PHASES.OUTGOING) {
      return { ...state, phase: PHASES.CONNECTING, call: current };
    }
    if (current.status === 'accepted' && state.phase === PHASES.INCOMING && !state.acceptedHere) {
      return ended(current, ENDED_REASONS.ANSWERED_ELSEWHERE);
    }
    return { ...state, call: current };
  }

  // Idle: pick up a call that is still ringing for us.
  const ringing = list.find((call) => call?.status === 'ringing' && call?.direction === 'incoming');
  if (ringing) {
    return { phase: PHASES.INCOMING, call: ringing, acceptedHere: false, endedReason: null };
  }
  return state;
}

/**
 * Accepted calls returned by `call:sync` that this device is not showing.
 * They have no audio here (the app restarted mid-call), so the provider ends
 * them instead of leaving the other person waiting for the grace timeout.
 */
export function findOrphanedCalls(state, calls) {
  const list = Array.isArray(calls) ? calls : [];
  return list
    .filter((call) => call?.status === 'accepted')
    .filter((call) => !(isLive(state) && call.id === state.call?.id))
    .map((call) => call.id);
}

export function callReducer(state = initialCallState, action = {}) {
  switch (action.type) {
    case 'OUTGOING_STARTED': {
      if (!isFree(state) || !action.call?.id) return state;
      if (action.call.status === 'busy') return ended(action.call, ENDED_REASONS.BUSY);
      return { phase: PHASES.OUTGOING, call: action.call, acceptedHere: false, endedReason: null };
    }

    case 'SERVER_EVENT':
      return onServerEvent(state, action.event, action.call);

    case 'ACCEPT_SENT':
      if (state.phase !== PHASES.INCOMING) return state;
      return { ...state, phase: PHASES.CONNECTING, acceptedHere: true };

    case 'ACCEPT_CONFIRMED':
      if (!sameCall(state, action.call)) return state;
      return { ...state, call: action.call };

    case 'MEDIA_CONNECTED':
      if (state.phase !== PHASES.CONNECTING) return state;
      return { ...state, phase: PHASES.ACTIVE };

    case 'MEDIA_FAILED':
      if (state.phase !== PHASES.CONNECTING && state.phase !== PHASES.ACTIVE) return state;
      return ended(state.call, action.reason || ENDED_REASONS.FAILED);

    case 'LOCAL_ENDED': {
      // Result of our own reject / cancel / hang-up. Uses the server's view
      // when there is one so the summary shows the final duration.
      if (!isLive(state)) return state;
      const call = sameCall(state, action.call) ? action.call : state.call;
      const reason = STATUS_REASONS[call?.status] ?? action.reason ?? ENDED_REASONS.ENDED;
      return ended(call, reason);
    }

    case 'SYNC':
      return onSync(state, action.calls);

    case 'RESET':
      return initialCallState;

    default:
      return state;
  }
}

/** The person on the other side, as the server's view describes them. */
export function otherParty(call) {
  if (!call) return null;
  return call.direction === 'outgoing' ? call.callee : call.caller;
}

/** Translation key for the summary line of an ended call. */
export function endedReasonKey(reason) {
  return `callActive.reasons.${reason || ENDED_REASONS.ENDED}`;
}

/**
 * Elapsed seconds of a live call, from the server's `answeredAt`, or the
 * server's final `durationSeconds` once it ended.
 */
export function elapsedSeconds(call, now = Date.now()) {
  if (!call) return 0;
  if (call.endedAt && Number.isFinite(Number(call.durationSeconds))) {
    return Math.max(0, Number(call.durationSeconds));
  }
  const answeredAt = call.answeredAt ? Date.parse(call.answeredAt) : NaN;
  if (Number.isNaN(answeredAt)) return 0;
  return Math.max(0, Math.floor((now - answeredAt) / 1000));
}

export default callReducer;
