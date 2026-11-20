/**
 * One WebRTC audio session per live call (Phase C3).
 *
 * `react-native-webrtc` and `react-native-incall-manager` are native modules.
 * They are loaded lazily, so the same JavaScript runs in Expo Go (no audio:
 * `isAudioSupported()` is false and the app behaves like C2) and in the
 * development build (real audio).
 *
 * Signalling goes through the Phase B socket: the caller offers once the call
 * is accepted, the callee answers, both trickle ICE. The ICE transport policy
 * comes from the server's call view (`relay` for leadership calls).
 *
 * Never logs SDP, ICE candidates or the call view.
 */
const CONNECT_TIMEOUT_MS = 20_000;

let webrtc;
let webrtcLoaded = false;
let inCall;
let inCallLoaded = false;

function loadWebRTC() {
  if (webrtcLoaded) return webrtc;
  webrtcLoaded = true;
  try {
    // eslint-disable-next-line global-require
    const mod = require('react-native-webrtc');
    webrtc = mod?.RTCPeerConnection && mod?.mediaDevices ? mod : null;
  } catch {
    webrtc = null; // Expo Go or a build without the native module
  }
  return webrtc;
}

function loadInCallManager() {
  if (inCallLoaded) return inCall;
  inCallLoaded = true;
  try {
    // eslint-disable-next-line global-require
    const mod = require('react-native-incall-manager');
    inCall = mod?.default ?? mod ?? null;
  } catch {
    inCall = null;
  }
  return inCall;
}

/** True when this build can carry audio (development build with WebRTC). */
export function isAudioSupported() {
  return Boolean(loadWebRTC());
}

/** True when the speaker can be switched (InCallManager present). */
export function isSpeakerSupported() {
  return Boolean(loadInCallManager());
}

export const SESSION_FAILURES = Object.freeze({
  MIC_DENIED: 'micDenied',
  FAILED: 'failed',
});

async function ensureMicrophonePermission() {
  // Loaded lazily so the module can be unit tested outside React Native.
  // eslint-disable-next-line global-require
  const { PermissionsAndroid, Platform } = require('react-native');
  if (Platform.OS !== 'android') return true; // iOS asks on first getUserMedia
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function candidateType(candidate) {
  const match = /\btyp\s+(\w+)/i.exec(candidate || '');
  return match ? match[1].toLowerCase() : 'unknown';
}

/** Diagnostics only: counts and states, never addresses, SDP or ICE strings. */
function logDiag(...args) {
  // eslint-disable-next-line no-console
  console.log('[call]', ...args);
}

/**
 * Calls one InCallManager method without ever throwing. Under the New
 * Architecture some methods of react-native-incall-manager can be missing or
 * throw ("undefined is not a function"); audio must keep working regardless.
 * Logs only the method name and the error message.
 */
function callInCall(manager, method, ...args) {
  if (!manager) return;
  const fn = manager[method];
  if (typeof fn !== 'function') {
    logDiag('incall missing', method);
    return;
  }
  try {
    const result = fn.apply(manager, args);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => logDiag('incall error', method, err?.message));
    }
  } catch (err) {
    logDiag('incall error', method, err?.message);
  }
}

function hasTurn(iceServers) {
  return (iceServers || []).some((server) =>
    [].concat(server?.urls || []).some((url) => /^turns?:/i.test(url))
  );
}

/**
 * @param {object} options
 * @param {object} options.call        Server call view (id, direction, iceTransportPolicy)
 * @param {Array}  options.iceServers  From the signalling ticket
 * @param {(kind: 'offer'|'answer'|'ice', data: object|null) => void} options.sendSignal
 * @param {() => void} options.onConnected
 * @param {(reason: string) => void} options.onFailed
 * @param {object} [options.rtc]              Injected for tests; defaults to react-native-webrtc
 * @param {object} [options.inCallManager]    Injected for tests; defaults to react-native-incall-manager
 * @param {() => Promise<boolean>} [options.requestMicrophone] Injected for tests
 */
export function createCallSession({
  call,
  iceServers,
  sendSignal,
  onConnected,
  onFailed,
  rtc = loadWebRTC(),
  inCallManager = loadInCallManager(),
  requestMicrophone = ensureMicrophonePermission,
}) {
  if (!rtc) throw new Error('WebRTC is not available in this build');

  const role = call.direction === 'outgoing' ? 'caller' : 'callee';
  const relayOnly = call.iceTransportPolicy === 'relay';

  let pc = null;
  let localStream = null;
  let closed = false;
  let connected = false;
  let remoteDescriptionSet = false;
  let connectTimer = null;
  let audioRouted = false; // InCallManager.start() was called
  let speakerOn = false; // last value sent to InCallManager
  const queuedCandidates = [];
  const queuedSignals = [];
  const localTypes = {};
  const remoteTypes = {};
  const countType = (bucket, candidate) => {
    const type = candidateType(candidate);
    // eslint-disable-next-line no-param-reassign
    bucket[type] = (bucket[type] || 0) + 1;
  };
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function fail(reason = SESSION_FAILURES.FAILED) {
    logDiag('session fail', role, reason, 'ice', pc?.iceConnectionState, 'local', localTypes, 'remote', remoteTypes);
    if (closed) return;
    close();
    onFailed?.(reason);
  }

  function markConnected() {
    if (connected || closed) return;
    connected = true;
    clearTimeout(connectTimer);
    onConnected?.();
  }

  async function flushCandidates() {
    while (queuedCandidates.length > 0) {
      const candidate = queuedCandidates.shift();
      // eslint-disable-next-line no-await-in-loop
      await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  async function applySignal(kind, data) {
    if (closed || !pc) return;
    if (kind === 'offer' && role === 'callee') {
      await pc.setRemoteDescription(new rtc.RTCSessionDescription(data));
      remoteDescriptionSet = true;
      await flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal('answer', { type: 'answer', sdp: answer.sdp });
    } else if (kind === 'answer' && role === 'caller') {
      await pc.setRemoteDescription(new rtc.RTCSessionDescription(data));
      remoteDescriptionSet = true;
      await flushCandidates();
    } else if (kind === 'ice') {
      if (!data || !data.candidate) return; // end-of-candidates
      countType(remoteTypes, data.candidate);
      if (!remoteDescriptionSet) queuedCandidates.push(data);
      else await pc.addIceCandidate(new rtc.RTCIceCandidate(data)).catch(() => {});
    }
  }

  /** Feeds a relayed signal. Signals that arrive before start() are queued. */
  async function handleSignal(kind, data) {
    if (closed) return;
    if (!pc) {
      queuedSignals.push([kind, data]);
      return;
    }
    await ready;
    try {
      await applySignal(kind, data);
    } catch {
      fail();
    }
  }

  async function start() {
    try {
      if (relayOnly && !hasTurn(iceServers)) {
        // A relay-only (leadership) call cannot connect without TURN.
        throw Object.assign(new Error('no TURN'), { reason: SESSION_FAILURES.FAILED });
      }
      if (!(await requestMicrophone())) {
        throw Object.assign(new Error('microphone denied'), {
          reason: SESSION_FAILURES.MIC_DENIED,
        });
      }

      localStream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
      if (closed) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }

      callInCall(inCallManager, 'start', { media: 'audio' });
      audioRouted = true;
      callInCall(inCallManager, 'setForceSpeakerphoneOn', speakerOn);

      logDiag('session start', role, 'relayOnly', relayOnly, 'iceServers', (iceServers || []).length);
      pc = new rtc.RTCPeerConnection({
        iceServers: iceServers || [],
        iceTransportPolicy: relayOnly ? 'relay' : 'all',
      });
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.addEventListener('icecandidate', (event) => {
        const candidate = event.candidate;
        if (candidate) countType(localTypes, candidate.candidate);
        else logDiag('local ICE gathered', role, localTypes);
        sendSignal(
          'ice',
          candidate
            ? {
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid ?? null,
                sdpMLineIndex: candidate.sdpMLineIndex ?? null,
              }
            : null
        );
      });

      const onState = () => {
        try {
          logDiag('state', role, 'ice', pc?.iceConnectionState, 'pc', pc?.connectionState);
          const state = pc?.connectionState || pc?.iceConnectionState;
          if (state === 'connected' || state === 'completed') markConnected();
          if (state === 'failed') fail();
        } catch (err) {
          // Never let a listener error escape into the native event loop.
          logDiag('state handler error', role, err?.message);
        }
      };
      pc.addEventListener('connectionstatechange', onState);
      pc.addEventListener('iceconnectionstatechange', onState);

      connectTimer = setTimeout(() => {
        if (!connected) fail();
      }, CONNECT_TIMEOUT_MS);

      resolveReady();

      if (role === 'caller') {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        sendSignal('offer', { type: 'offer', sdp: offer.sdp });
      }

      // Signals that arrived while the microphone was opening.
      while (queuedSignals.length > 0) {
        const [kind, data] = queuedSignals.shift();
        // eslint-disable-next-line no-await-in-loop
        await applySignal(kind, data);
      }
    } catch (err) {
      logDiag('start failed', role, err?.reason || '', err?.message);
      fail(err?.reason || SESSION_FAILURES.FAILED);
    }
  }

  function setMuted(muted) {
    localStream?.getAudioTracks().forEach((track) => {
      // eslint-disable-next-line no-param-reassign
      track.enabled = !muted;
    });
  }

  /**
   * Only calls InCallManager when the value really changes; before start()
   * the value is remembered and applied once audio routing begins.
   */
  function setSpeaker(on) {
    const next = Boolean(on);
    if (next === speakerOn) return;
    speakerOn = next;
    if (audioRouted && !closed) callInCall(inCallManager, 'setForceSpeakerphoneOn', next);
  }

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(connectTimer);
    resolveReady?.();
    try {
      localStream?.getTracks().forEach((track) => track.stop());
    } catch {
      // already stopped
    }
    try {
      pc?.close();
    } catch {
      // already closed
    }
    if (audioRouted) callInCall(inCallManager, 'stop');
    audioRouted = false;
    localStream = null;
    pc = null;
  }

  return {
    callId: call.id,
    role,
    start,
    handleSignal,
    setMuted,
    setSpeaker,
    close,
    isClosed: () => closed,
  };
}

export default createCallSession;