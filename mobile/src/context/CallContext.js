/**
 * Live calls (Phase C).
 *
 * Owns the signalling connection, the call state machine and the ringtone.
 * The call UI (`components/calls/CallOverlay.js`) and the screens that start
 * calls read everything from `useCall()`.
 *
 * C2 scope: ringing, answering, declining, cancelling, hanging up, busy and
 * missed. There is no audio yet: `AUDIO_ENABLED` is false and a call goes
 * straight from "connecting" to "active". Phase C3 plugs WebRTC in here.
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
import { Alert, AppState, Vibration } from 'react-native';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import {
  PHASES,
  callReducer,
  findOrphanedCalls,
  initialCallState,
} from '../calls/callMachine';
import { createSignalingClient, SIGNALING_STATUS } from '../services/signaling';
import { playSound } from '../services/sound';

export const AUDIO_ENABLED = false;

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

  const clientRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const sync = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const { calls } = await client.emit('call:sync', {});
      const orphans = findOrphanedCalls(stateRef.current, calls);
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
          dispatch({ type: 'SERVER_EVENT', event, call: payload });
        }
        // signal:* events are handled by the WebRTC session in Phase C3.
      },
      onStatus: setStatus,
      onConnect: sync,
    });
    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
      dispatch({ type: 'RESET' });
    };
  }, [isAuthenticated, user?.employeeId, sync]);

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

  // C2 has no audio: "connecting" means "accepted", so go straight to active.
  useEffect(() => {
    if (state.phase === PHASES.CONNECTING && !AUDIO_ENABLED) {
      dispatch({ type: 'MEDIA_CONNECTED' });
    }
  }, [state.phase]);

  // Show the summary briefly, then close the call UI.
  useEffect(() => {
    if (state.phase !== PHASES.ENDED) return undefined;
    setLastEndedAt(Date.now());
    setMuted(false);
    setSpeaker(false);
    const timer = setTimeout(() => dispatch({ type: 'RESET' }), SUMMARY_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.call?.id]);

  useRingtone(state.phase === PHASES.INCOMING);

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

  const accept = useCallback(async () => {
    const { call } = stateRef.current;
    if (!call) return;
    dispatch({ type: 'ACCEPT_SENT' });
    try {
      const reply = await requireClient().emit('call:accept', { callId: call.id });
      dispatch({ type: 'ACCEPT_CONFIRMED', call: reply.call });
    } catch {
      // Usually the caller cancelled at the same moment; the server's event
      // has already ended the call. Otherwise end it locally.
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
    try {
      const reply = await requireClient().emit(event, { callId: call.id });
      dispatch({ type: 'LOCAL_ENDED', call: reply.call });
    } catch {
      dispatch({ type: 'LOCAL_ENDED', reason: 'ended' });
    }
  }, [requireClient]);

  const value = useMemo(
    () => ({
      state,
      status,
      available: status === SIGNALING_STATUS.CONNECTED,
      audioEnabled: AUDIO_ENABLED,
      muted,
      setMuted,
      speaker,
      setSpeaker,
      lastEndedAt,
      startCall,
      accept,
      reject,
      hangUp,
    }),
    [state, status, muted, speaker, lastEndedAt, startCall, accept, reject, hangUp]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export default CallContext;
