/**
 * Native call UI bridge (Phase D): expo-callkit-telecom <-> our call flow.
 *
 * The module shows the system call screen (Android Core-Telecom, iOS CallKit)
 * and rings even when the app is closed: our server's FCM push is parsed
 * natively before JS runs. This bridge keeps that system call and our own
 * call state (CallContext + callMachine) in step:
 *
 *   socket ring          -> reportIncoming   (system UI rings)
 *   push ring (native)   -> session added    (we learn the call id)
 *   system "answer"      -> onAnswer(callId) (CallContext accepts + WebRTC)
 *   media connected      -> connected()      (fulfil the answer / report outgoing)
 *   system "end/decline" -> onEnd(callId)    (CallContext rejects / hangs up)
 *   our call ended       -> end()            (dismiss the system UI)
 *
 * One call at a time, like the module itself. The module is loaded lazily so
 * Expo Go and the Node tests run without it; it is injected in tests.
 * Never logs call ids, names or tokens.
 */

let cachedModule;
let moduleLoaded = false;

/** expo-callkit-telecom, or null (Expo Go / build without it). */
export function loadCallModule() {
  if (moduleLoaded) return cachedModule;
  moduleLoaded = true;
  try {
    // eslint-disable-next-line global-require
    const mod = require('expo-callkit-telecom');
    cachedModule = typeof mod?.reportIncomingCall === 'function' ? mod : null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** UUID v4 for push/report dedup only (not a secret). */
export function randomEventId() {
  const hex = [];
  for (let i = 0; i < 16; i += 1) hex.push(Math.floor(Math.random() * 256));
  hex[6] = (hex[6] & 0x0f) | 0x40;
  hex[8] = (hex[8] & 0x3f) | 0x80;
  const h = hex.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Our ended reason -> the module's CallEndedReason. */
export function moduleEndReason(reason) {
  switch (reason) {
    case 'missed':
      return 'unanswered';
    case 'failed':
    case 'micDenied':
    case 'busy':
      return 'failed';
    default:
      return 'remoteEnded';
  }
}

const CALL_OPTIONS = Object.freeze({ hasVideo: false, supportsHolding: false, supportsDTMF: false });
const CALLER_ID = 'internal-comms'; // opaque and fixed: never identifies a person

/**
 * @param {object} deps
 * @param {object} [deps.calls]   The expo-callkit-telecom module (injected in tests)
 * @param {(callId: string) => void} deps.onAnswer  User answered in the system UI
 * @param {(callId: string) => void} deps.onEnd     User declined / ended in the system UI, or the OS ended it
 * @param {(muted: boolean) => void} [deps.onMuted] Mute toggled in the system UI
 * @param {() => string} [deps.newEventId]
 * @returns {object|null} null when the module is not available
 */
export function createSystemCallBridge({
  calls = loadCallModule(),
  onAnswer,
  onEnd,
  onMuted,
  newEventId = randomEventId,
}) {
  if (!calls) return null;

  const sessionByCall = new Map(); // callId -> sessionId
  const callBySession = new Map(); // sessionId -> callId
  const outgoingSessions = new Set();
  const answerRequests = new Map(); // sessionId -> requestId (waiting for media)
  const answeredInApp = new Set(); // callIds answered from our own screen
  const endedByUs = new Set(); // sessionIds we ended (ignore their end event)
  const mutedBySession = new Map();
  const subscriptions = [];
  let speakerOn = null;

  const quiet = (promise) => {
    Promise.resolve(promise).catch(() => {});
  };

  function link(sessionId, callId) {
    if (!sessionId || !callId) return;
    sessionByCall.set(callId, sessionId);
    callBySession.set(sessionId, callId);
  }

  function forget(sessionId) {
    const callId = callBySession.get(sessionId);
    callBySession.delete(sessionId);
    if (callId) {
      sessionByCall.delete(callId);
      answeredInApp.delete(callId);
    }
    outgoingSessions.delete(sessionId);
    answerRequests.delete(sessionId);
    mutedBySession.delete(sessionId);
    endedByUs.delete(sessionId);
  }

  /** The call id of a session: our map first, then the push payload. */
  async function callIdOf(sessionId, session) {
    const known = callBySession.get(sessionId);
    if (known) return known;
    let source = session;
    if (!source) {
      try {
        source = await calls.getActiveCallSession?.();
      } catch {
        source = null;
      }
      if (source && source.id !== sessionId) source = null;
    }
    const callId = source?.incomingCallEvent?.serverCallId || null;
    if (callId) link(sessionId, callId);
    return callId;
  }

  function attach() {
    const on = (name, handler) => {
      const add = calls[name];
      if (typeof add === 'function') subscriptions.push(add(handler));
    };

    // Every session, ours or reported natively from a push.
    on('addCallSessionAddedListener', (event) => {
      const session = event?.session;
      const callId = session?.incomingCallEvent?.serverCallId;
      if (session?.id && callId) link(session.id, callId);
    });

    on('addCallAnsweredListener', async (event) => {
      const sessionId = event?.id;
      if (!sessionId) return;
      if (event.requestId) answerRequests.set(sessionId, event.requestId);
      const callId = await callIdOf(sessionId);
      if (!callId) return;
      if (answeredInApp.has(callId)) return; // our own answerCall echo
      onAnswer?.(callId);
    });

    on('addCallEndedListener', async (event) => {
      const sessionId = event?.id;
      if (!sessionId) return;
      if (endedByUs.has(sessionId)) {
        forget(sessionId);
        return;
      }
      const callId = await callIdOf(sessionId, event.session);
      forget(sessionId);
      if (callId) onEnd?.(callId);
    });

    on('addCallSessionRemovedListener', (event) => {
      if (event?.id) forget(event.id);
    });

    on('addSetMutedActionListener', (event) => {
      if (!event?.id) return;
      mutedBySession.set(event.id, Boolean(event.isMuted));
      onMuted?.(Boolean(event.isMuted));
    });
  }

  function detach() {
    subscriptions.splice(0).forEach((sub) => {
      try {
        sub?.remove?.();
      } catch {
        // already removed
      }
    });
  }

  return {
    attach,
    detach,

    /** Rings the system UI for a call that arrived on the socket. */
    reportIncoming(call, displayName) {
      if (!call?.id || sessionByCall.has(call.id)) return;
      // Fails harmlessly when the push already reported it (one session max).
      quiet(
        calls.reportIncomingCall({
          eventId: newEventId(),
          serverCallId: String(call.id),
          ...CALL_OPTIONS,
          caller: { id: CALLER_ID, displayName: displayName || undefined },
        })
      );
    },

    /** Registers our outgoing call with the OS (audio routing, call screen). */
    async startOutgoing(call, displayName) {
      if (!call?.id || sessionByCall.has(call.id)) return;
      try {
        const sessionId = await calls.startOutgoingCall(
          { id: CALLER_ID, displayName: displayName || undefined },
          CALL_OPTIONS
        );
        link(sessionId, call.id);
        outgoingSessions.add(sessionId);
      } catch {
        // The call still works without the system call screen.
      }
    },

    /** The user answered on our own screen: tell the OS (stops its ring). */
    answerFromApp(callId) {
      answeredInApp.add(callId);
      const sessionId = sessionByCall.get(callId);
      if (sessionId) quiet(calls.answerCall(sessionId));
    },

    /** Media is flowing: finish the answer / mark the outgoing call connected. */
    connected(callId) {
      const sessionId = sessionByCall.get(callId);
      if (!sessionId) return;
      const requestId = answerRequests.get(sessionId);
      if (requestId) {
        answerRequests.delete(sessionId);
        quiet(calls.fulfillIncomingCallConnected(requestId));
      }
      if (outgoingSessions.has(sessionId)) quiet(calls.reportOutgoingCallConnected(sessionId));
    },

    /** Our call ended (any side, any reason): dismiss the system call. */
    end(callId, reason) {
      const sessionId = sessionByCall.get(callId);
      if (!sessionId || endedByUs.has(sessionId)) return;
      endedByUs.add(sessionId);
      answerRequests.delete(sessionId);
      quiet(calls.reportCallEnded(sessionId, moduleEndReason(reason)));
    },

    setMuted(callId, muted) {
      const sessionId = sessionByCall.get(callId);
      if (!sessionId || mutedBySession.get(sessionId) === Boolean(muted)) return;
      mutedBySession.set(sessionId, Boolean(muted));
      quiet(calls.setMuted(sessionId, Boolean(muted)));
    },

    setSpeaker(on) {
      if (speakerOn === Boolean(on)) return;
      speakerOn = Boolean(on);
      try {
        calls.setAudioSessionPortOverride?.(speakerOn);
      } catch {
        // speaker routing is best effort
      }
    },

    // ---- push token (FCM on Android, APNs VoIP on iOS) -------------------

    registerPush() {
      try {
        calls.registerVoIPPush?.();
      } catch {
        // no Firebase config: calls from the socket still work
      }
    },

    /** { token, type: 'FCM' | 'APNS_VOIP' } or null */
    getPushToken() {
      try {
        const value = calls.getVoIPPushToken?.();
        return value?.token ? value : null;
      } catch {
        return null;
      }
    },

    /** Calls back with { token, type } whenever the token changes; returns unsubscribe. */
    onPushToken(listener) {
      const add = calls.addVoIPPushTokenUpdatedListener;
      if (typeof add !== 'function') return () => {};
      const sub = add((event) => {
        if (event?.token) listener({ token: event.token, type: event.type });
      });
      return () => sub?.remove?.();
    },

    hasSession(callId) {
      return sessionByCall.has(callId);
    },
  };
}
