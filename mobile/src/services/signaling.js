/**
 * Phase B signalling client (socket.io).
 *
 * - Tickets are single use, so socket.io's own reconnection is turned off and
 *   every (re)connection goes through `start()`, which fetches a fresh ticket.
 * - A 404 CALL_SIGNALING_DISABLED from the ticket endpoint puts the client in
 *   the `disabled` state: the app keeps working as before (REST history only).
 * - Acknowledgement errors are turned into the same ApiError the REST client
 *   throws, so screens can show the server's Arabic message unchanged.
 * - SDP, ICE and call views are never logged.
 */
import { io } from 'socket.io-client';
import { api, ApiError, getApiBaseUrl, isBackendConfigured } from './api';

export const SIGNALING_STATUS = Object.freeze({
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISABLED: 'disabled',
});

const SERVER_EVENTS = [
  'call:incoming',
  'call:outgoing',
  'call:accepted',
  'call:rejected',
  'call:cancelled',
  'call:missed',
  'call:ended',
  'call:busy',
  'signal:offer',
  'signal:answer',
  'signal:ice',
];

const ACK_TIMEOUT_MS = 8000;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * @param {object} handlers
 * @param {(event: string, payload: object) => void} handlers.onEvent
 * @param {(status: string) => void} [handlers.onStatus]
 * @param {() => void} [handlers.onConnect]
 */
export function createSignalingClient({ onEvent, onStatus, onConnect } = {}) {
  let socket = null;
  let stopped = true;
  let starting = false;
  let retryTimer = null;
  let attempt = 0;
  let ticket = null;
  let iceServers = [];
  let turnConfigured = false;
  let status = SIGNALING_STATUS.OFFLINE;

  function setStatus(next) {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  }

  function scheduleRetry() {
    if (stopped) return;
    clearTimeout(retryTimer);
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      start();
    }, delay);
  }

  function buildSocket(info) {
    const created = io(`${getApiBaseUrl()}${info.namespace || '/calls'}`, {
      path: info.path || '/api/calls/socket',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      // Read at connect time: always the ticket fetched just before connect().
      auth: (cb) => cb({ ticket: ticket?.ticket }),
    });

    created.on('connect', () => {
      attempt = 0;
      ticket = null; // consumed by the server
      setStatus(SIGNALING_STATUS.CONNECTED);
      onConnect?.();
    });

    created.on('disconnect', (reason) => {
      setStatus(SIGNALING_STATUS.OFFLINE);
      if (reason !== 'io client disconnect') scheduleRetry();
    });

    created.on('connect_error', () => {
      setStatus(SIGNALING_STATUS.OFFLINE);
      scheduleRetry();
    });

    for (const event of SERVER_EVENTS) {
      created.on(event, (payload) => onEvent?.(event, payload));
    }
    return created;
  }

  /** Connects (or reconnects) with a fresh ticket. Safe to call repeatedly. */
  async function start() {
    stopped = false;
    if (starting || socket?.connected) return;
    if (!isBackendConfigured()) {
      setStatus(SIGNALING_STATUS.DISABLED);
      return;
    }

    starting = true;
    clearTimeout(retryTimer);
    setStatus(SIGNALING_STATUS.CONNECTING);
    try {
      const info = await api.calls.signalingTicket();
      if (stopped) return;
      ticket = info;
      iceServers = Array.isArray(info.iceServers) ? info.iceServers : [];
      turnConfigured = Boolean(info.turnConfigured);
      if (!socket) socket = buildSocket(info);
      socket.connect();
    } catch (err) {
      if (err?.code === 'CALL_SIGNALING_DISABLED') {
        // The server flag is off: stay quiet until the next start() (the
        // provider calls it again when the app returns to the foreground).
        setStatus(SIGNALING_STATUS.DISABLED);
        return;
      }
      setStatus(SIGNALING_STATUS.OFFLINE);
      if (err?.status !== 401) scheduleRetry();
    } finally {
      starting = false;
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    ticket = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    setStatus(SIGNALING_STATUS.OFFLINE);
  }

  /**
   * Emits an event and waits for the server's acknowledgement.
   * Resolves with the reply (without `ok`), rejects with ApiError.
   */
  async function emit(event, payload = {}) {
    if (!socket?.connected) {
      throw new ApiError('signalling offline', { status: 0, code: 'SIGNALING_OFFLINE' });
    }
    let reply;
    try {
      reply = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload);
    } catch {
      throw new ApiError('signalling timeout', { status: 0, code: 'TIMEOUT' });
    }
    if (!reply?.ok) {
      throw new ApiError(reply?.message || 'error', {
        status: 0,
        code: reply?.code || 'INTERNAL',
      });
    }
    const { ok, ...rest } = reply;
    return rest;
  }

  return {
    start,
    stop,
    emit,
    getStatus: () => status,
    getIceServers: () => iceServers,
    isTurnConfigured: () => turnConfigured,
  };
}

export default createSignalingClient;
