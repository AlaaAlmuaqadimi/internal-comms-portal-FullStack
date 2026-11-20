/**
 * Live calls (Phase C).
 *
 * Owns the signalling connection, the call state machine and the ringtone.
 * The call UI (`components/calls/CallOverlay.js`) and the screens that start
 * calls read everything from `useCall()`.
 *
 * Ringing, answering, declining, cancelling, hanging up, busy and missed
 * (C2), plus WebRTC audio when the build has it (C3). In Expo Go
 * `AUDIO_ENABLED` is false and a call goes straight from "connecting" to
 * "active" without audio.
 *
 * Phase D: when expo-callkit-telecom is in the build, the system call screen
 * (Android Core-Telecom / iOS CallKit) rings, also with the app closed via
 * our FCM push, and owns the call audio (speaker, mute). `calls/systemCalls.js`
 * keeps it in step with this state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, PermissionsAndroid, Platform, Vibration } from 'react-native';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import {
  PHASES,
  callReducer,
  findOrphanedCalls,
  initialCallState,
  otherParty,
} from '../calls/callMachine';
import { createSystemCallBridge, loadCallModule } from '../calls/systemCalls';
import { api } from '../services/api';
import { configurePushTokens, registerPushToken } from '../services/pushTokens';
import { createSignalingClient, SIGNALING_STATUS } from '../services/signaling';
import { playSound } from '../services/sound';
import { createCallSession, isAudioSupported, isSpeakerSupported } from '../calls/callSession';

// Decided once: true in the development build (react-native-webrtc present),
// false in Expo Go, where calls ring and connect without audio.
export const AUDIO_ENABLED = isAudioSupported();
// Phase D: the native call UI module (development / production build only).
const SYSTEM_CALLS = AUDIO_ENABLED && Boolean(loadCallModule());
const SPEAKER_ENABLED = AUDIO_ENABLED && (SYSTEM_CALLS || isSpeakerSupported());

/**
 * Ask for the microphone (and, on Android 13+, notifications) while the app
 * is on screen. A call answered from the lock screen cannot show a permission
 * dialog, so without this the first such call ends with "microphone denied".
 */
async function askCallPermissions() {
  if (Platform.OS !== 'android' || !AUDIO_ENABLED) return;
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
    wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  try {
    const missing = [];
    for (const permission of wanted) {
      if (!(await PermissionsAndroid.check(permission))) missing.push(permission);
    }
    if (missing.length) await PermissionsAndroid.requestMultiple(missing);
  } catch {
    // The call itself reports a missing microphone.
  }
}

function logCall(...args) {
  // eslint-disable-next-line no-console
  console.log('[call]', ...args);
}

configurePushTokens(api);
const MAX_BUFFERED_SIGNALS = 200;

const SUMMARY_MS = 2000;
const RING_REPEAT_MS = 3000;
const RING_VIBRATION = [0, 800, 1200];

const CallContext = createContext(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used inside CallProvider');
  }
  return context;
};

function useRingtone(active) {
  useEffect(() => {
    if (!active) return undefined;
    playSound('bell');
    Vibration.vibrate(RING_VIBRATION, true);
    const timer = setInterval(() => playSound('bell'), RING_REPEAT_MS);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [active]);
}

/**
 * Starts a call and shows the right message when it cannot start
 * (service off, offline, forbidden target, rate limit...). Used by the
 * Directory and Calls screens so both behave the same.
 */
export function useStartCall() {
  const { startCall } = useCall();
  const { t } = useLanguage();
  return useCallback(
    async (calleeEmployeeId) => {
      if (!calleeEmployeeId) return null;
      try {
        return await startCall(calleeEmployeeId);
      } catch (err) {
        let message = t('callActive.failedToStart');
        if (err?.code === 'CALL_SIGNALING_DISABLED') message = t('callActive.disabled');
        else if (err?.code === 'SIGNALING_OFFLINE' || err?.code === 'TIMEOUT') {
          message = t('callActive.unavailable');
        } else if (err?.message && err?.code && err.code !== 'INTERNAL') {
          // The server's own Arabic message (e.g. CALL_TARGET_FORBIDDEN).
          message = err.message;
        }
        Alert.alert(t('callActive.failedToStart'), message);
        return null;
      }
    },
    [startCall, t]
  );
}

export const CallProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const [status, setStatus] = useState(SIGNALING_STATUS.OFFLINE);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [lastEndedAt, setLastEndedAt] = useState(0);
  // { callId, status, code } from the audio session; see calls/securityCode.js.
  const [securityCode, setSecurityCode] = useState(null);

  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  // Signals that arrive before the session exists (e.g. the offer racing the
  // callee's microphone prompt), keyed by call id.
  const bufferedSignalsRef = useRef(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Phase D: native call UI. Actions answered / ended in the system UI wait
  // here until this call is known (e.g. the app was opened from the lock
  // screen and is still connecting).
  const bridgeRef = useRef(null);
  const pendingAnswerRef = useRef(null);
  const pendingEndRef = useRef(null);
  const actionsRef = useRef({});

  const closeSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    bufferedSignalsRef.current.clear();
    setSecurityCode(null);
  }, []);

  const routeSignal = useCallback((event, payload) => {
    const kind = event.slice('signal:'.length);
    const callId = payload?.callId;
    if (!callId) return;
    const session = sessionRef.current;
    if (session && session.callId === callId) {
      session.handleSignal(kind, payload.data);
      return;
    }
    if (stateRef.current.call?.id !== callId) return;
    const buffer = bufferedSignalsRef.current.get(callId) || [];
    if (buffer.length < MAX_BUFFERED_SIGNALS) buffer.push([kind, payload.data]);
    bufferedSignalsRef.current.set(callId, buffer);
  }, []);

  const sync = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const { calls } = await client.emit('call:sync', {});
      const orphans = findOrphanedCalls(stateRef.current, calls);
      const current = stateRef.current.call?.id;
      if (current) {
        const seen = (calls || []).find((item) => item?.id === current);
        logCall('sync', stateRef.current.phase, seen ? seen.status : 'missing', 'orphans', orphans.length);
      }
      dispatch({ type: 'SYNC', calls });
      // An accepted call this device is not showing has no audio here (the
      // app restarted mid-call): end it instead of leaving the peer waiting.
      for (const callId of orphans) {
        client.emit('call:end', { callId }).catch(() => {});
      }
    } catch {
      // Offline or timed out: the next (re)connect syncs again.
    }
  }, []);

  // Connect while signed in; disconnect on logout or account switch.
  useEffect(() => {
    if (!isAuthenticated || !user?.employeeId) return undefined;

    const client = createSignalingClient({
      onEvent: (event, payload) => {
        if (event.startsWith('call:')) {
          if (payload?.id && payload.id === stateRef.current.call?.id) {
            logCall('server event', event, payload.status);
          }
          dispatch({ type: 'SERVER_EVENT', event, call: payload });
        } else if (event.startsWith('signal:')) {
          routeSignal(event, payload);
        }
      },
      onStatus: setStatus,
      onConnect: sync,
    });
    clientRef.current = client;
    client.start();

    return () => {
      closeSession();
      client.stop();
      clientRef.current = null;
      dispatch({ type: 'RESET' });
    };
  }, [isAuthenticated, user?.employeeId, sync, routeSignal, closeSession]);

  // Back in the foreground: reconnect if needed, otherwise reconcile.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const client = clientRef.current;
      if (!client) return;
      if (client.getStatus() === SIGNALING_STATUS.CONNECTED) sync();
      else client.start();
    });
    return () => subscription.remove();
  }, [sync]);

  // "connecting": open the microphone and set up WebRTC. Without WebRTC
  // (Expo Go) the call is considered connected straight away.
  useEffect(() => {
    if (state.phase !== PHASES.CONNECTING || !state.call) return;
    if (!AUDIO_ENABLED) {
      dispatch({ type: 'MEDIA_CONNECTED' });
      return;
    }
    if (sessionRef.current?.callId === state.call.id) return;

    const client = clientRef.current;
    const callId = state.call.id;
    let session;
    try {
      session = createCallSession({
        call: state.call,
        iceServers: client?.getIceServers() || [],
        sendSignal: (kind, data) => {
          clientRef.current?.emit(`signal:${kind}`, { callId, data }).catch(() => {});
        },
        onConnected: () => dispatch({ type: 'MEDIA_CONNECTED' }),
        onSecurityCode: (result) => setSecurityCode({ ...result, callId }),
        // The system call (Telecom / CallKit) owns audio routing.
        ...(SYSTEM_CALLS ? { inCallManager: null } : {}),
        onFailed: (reason) => {
          // Tell the server so the other side does not wait for the grace
          // timeout, then show the reason here.
          clientRef.current?.emit('call:end', { callId }).catch(() => {});
          dispatch({ type: 'MEDIA_FAILED', reason });
        },
      });
    } catch {
      dispatch({ type: 'MEDIA_FAILED' });
      return;
    }

    sessionRef.current = session;
    const buffered = bufferedSignalsRef.current.get(callId) || [];
    bufferedSignalsRef.current.delete(callId);
    buffered.forEach(([kind, data]) => session.handleSignal(kind, data));
    session.start();
  }, [state.phase, state.call]);

  // The audio session lives only while the call is connecting or active.
  useEffect(() => {
    if (state.phase !== PHASES.CONNECTING && state.phase !== PHASES.ACTIVE) {
      closeSession();
    }
  }, [state.phase, closeSession]);

  useEffect(() => {
    sessionRef.current?.setMuted(muted);
    if (state.call?.id) bridgeRef.current?.setMuted(state.call.id, muted);
  }, [muted, state.phase, state.call?.id]);

  useEffect(() => {
    if (bridgeRef.current) {
      if (state.phase === PHASES.CONNECTING || state.phase === PHASES.ACTIVE) {
        bridgeRef.current.setSpeaker(speaker);
      }
    } else {
      sessionRef.current?.setSpeaker(speaker);
    }
  }, [speaker, state.phase]);

  // ---- Phase D: native call UI ---------------------------------------------

  // One bridge for the app's lifetime; its handlers read the latest actions.
  useEffect(() => {
    if (!SYSTEM_CALLS) return undefined;
    const bridge = createSystemCallBridge({
      onAnswer: (callId) => {
        const { phase, call } = stateRef.current;
        logCall('system answer', phase, call?.id === callId ? 'current' : 'pending');
        if (call?.id === callId && phase === PHASES.INCOMING) {
          actionsRef.current.accept?.({ fromSystem: true });
        } else {
          pendingAnswerRef.current = callId; // not synced yet: accept when it is
        }
      },
      onEnd: (callId) => {
        const { phase, call } = stateRef.current;
        logCall('system end', phase, call?.id === callId ? 'current' : 'pending');
        if (call?.id !== callId) {
          pendingEndRef.current = callId;
          return;
        }
        if (phase === PHASES.INCOMING) actionsRef.current.reject?.();
        else if (phase !== PHASES.ENDED && phase !== PHASES.IDLE) actionsRef.current.hangUp?.();
      },
      onMuted: (value) => setMuted(value),
    });
    if (!bridge) return undefined;
    bridgeRef.current = bridge;
    bridge.attach();
    return () => {
      bridge.detach();
      bridgeRef.current = null;
    };
  }, []);

  // Push token: register this phone for incoming-call pushes while signed in.
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !isAuthenticated || !user?.employeeId) return undefined;
    askCallPermissions();
    bridge.registerPush();
    const current = bridge.getPushToken();
    if (current) registerPushToken(current);
    return bridge.onPushToken((value) => registerPushToken(value));
  }, [isAuthenticated, user?.employeeId]);

  // Keep the system call in step with our call state.
  useEffect(() => {
    const bridge = bridgeRef.current;
    const { call, phase, endedReason } = state;
    if (!bridge || !call?.id) return;
    const name = otherParty(call)?.name || undefined;

    if (phase === PHASES.INCOMING) {
      if (pendingEndRef.current === call.id) {
        pendingEndRef.current = null;
        actionsRef.current.reject?.();
        return;
      }
      bridge.reportIncoming(call, name);
      if (pendingAnswerRef.current === call.id) {
        pendingAnswerRef.current = null;
        actionsRef.current.accept?.({ fromSystem: true });
      }
    } else if (phase === PHASES.OUTGOING) {
      bridge.startOutgoing(call, name);
    } else if (phase === PHASES.ACTIVE) {
      bridge.connected(call.id);
    } else if (phase === PHASES.ENDED) {
      bridge.end(call.id, endedReason);
    }
  }, [state]);

  // Show the summary briefly, then close the call UI.
  useEffect(() => {
    if (state.phase !== PHASES.ENDED) return undefined;
    setLastEndedAt(Date.now());
    setMuted(false);
    setSpeaker(false);
    const timer = setTimeout(() => dispatch({ type: 'RESET' }), SUMMARY_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.call?.id]);

  // Diagnostics: phase changes only (no names, ids or call details).
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[call] phase', state.phase, state.endedReason || '', state.call?.direction || '');
  }, [state.phase, state.endedReason, state.call?.direction]);

  // With the native call UI the system rings (also over the lock screen).
  useRingtone(state.phase === PHASES.INCOMING && !SYSTEM_CALLS);

  const requireClient = useCallback(() => {
    const client = clientRef.current;
    if (!client || client.getStatus() !== SIGNALING_STATUS.CONNECTED) {
      const error = new Error('signalling unavailable');
      error.code =
        client?.getStatus() === SIGNALING_STATUS.DISABLED
          ? 'CALL_SIGNALING_DISABLED'
          : 'SIGNALING_OFFLINE';
      throw error;
    }
    return client;
  }, []);

  /** Starts a call. Throws (with `code`) so the screen can show a message. */
  const startCall = useCallback(
    async (calleeEmployeeId) => {
      const client = requireClient();
      const { call } = await client.emit('call:invite', { calleeEmployeeId });
      dispatch({ type: 'OUTGOING_STARTED', call });
      return call;
    },
    [requireClient]
  );

  /** `fromSystem`: answered in the system call UI (it already knows). */
  const accept = useCallback(async ({ fromSystem = false } = {}) => {
    const { call, phase } = stateRef.current;
    if (!call || phase !== PHASES.INCOMING) return;
    if (!fromSystem) bridgeRef.current?.answerFromApp(call.id);
    dispatch({ type: 'ACCEPT_SENT' });
    try {
      // Our push token lets the server stop the ring on our *other* phones
      // without hanging up this one.
      const pushToken = bridgeRef.current?.getPushToken()?.token;
      const reply = await requireClient().emit('call:accept', {
        callId: call.id,
        ...(pushToken ? { pushToken } : {}),
      });
      dispatch({ type: 'ACCEPT_CONFIRMED', call: reply.call });
    } catch {
      // Usually the caller cancelled at the same moment; the server's event
      // has already ended the call. Otherwise end it here and tell the server,
      // so the call does not stay "accepted" and block the next one.
      clientRef.current?.emit('call:end', { callId: call.id }).catch(() => {});
      dispatch({ type: 'LOCAL_ENDED', reason: 'failed' });
    }
  }, [requireClient]);

  const reject = useCallback(async () => {
    const { call } = stateRef.current;
    if (!call) return;
    try {
      const reply = await requireClient().emit('call:reject', { callId: call.id });
      dispatch({ type: 'LOCAL_ENDED', call: reply.call });
    } catch {
      dispatch({ type: 'LOCAL_ENDED', reason: 'rejected' });
    }
  }, [requireClient]);

  /** Cancel while ringing out, end once the call was accepted. */
  const hangUp = useCallback(async () => {
    const { phase, call } = stateRef.current;
    if (!call) return;
    const event = phase === PHASES.OUTGOING ? 'call:cancel' : 'call:end';
    logCall('hang up', phase, event);
    try {
      const reply = await requireClient().emit(event, { callId: call.id });
      dispatch({ type: 'LOCAL_ENDED', call: reply.call });
    } catch (err) {
      logCall('hang up not confirmed', event, clientRef.current?.getStatus?.(), err?.message);
      // Best effort: whichever of cancel/end applies, so nothing stays open.
      clientRef.current?.emit('call:end', { callId: call.id }).catch(() => {});
      clientRef.current?.emit('call:cancel', { callId: call.id }).catch(() => {});
      dispatch({ type: 'LOCAL_ENDED', reason: 'ended' });
    }
  }, [requireClient]);

  actionsRef.current = { accept, reject, hangUp };

  const value = useMemo(
    () => ({
      state,
      status,
      available: status === SIGNALING_STATUS.CONNECTED,
      audioEnabled: AUDIO_ENABLED,
      speakerEnabled: SPEAKER_ENABLED,
      // The phone's own call UI rings and answers; the app shows the call
      // only once it is answered.
      systemCalls: SYSTEM_CALLS,
      muted,
      setMuted,
      speaker,
      setSpeaker,
      lastEndedAt,
      securityCode: securityCode && securityCode.callId === state.call?.id ? securityCode : null,
      startCall,
      accept,
      reject,
      hangUp,
    }),
    [state, status, muted, speaker, lastEndedAt, securityCode, startCall, accept, reject, hangUp]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export default CallContext;