/**
 * Phase B call signalling over socket.io.
 *
 * The socket layer authenticates, calls the same `call.service.js` functions
 * the REST API uses, and fans the result out to the two participants. The
 * database stays the single source of truth for call state; this module keeps
 * only tickets, timers and socket rooms in memory (single API instance; Phase F
 * covers multiple instances).
 *
 * Off by default: nothing here runs, and socket.io is not even loaded, unless
 * CALL_SIGNALING_ENABLED=true.
 *
 * See docs/calls-phase-b-plan.md for the event contract.
 */
import { env } from '../../../config/env.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import * as callService from '../call.service.js';
import { inviteCallSchema } from '../call.schemas.js';
import { createTicketStore } from './ticketStore.js';
import { createCallTimers } from './callTimers.js';
import { createRateWindow } from './rateWindow.js';
import { buildIceServers, hasTurn } from './iceServers.js';
import { SIGNAL_KINDS, canSendSignal, sanitizeSignal } from './relay.js';
import { createCallPushNotifier } from '../../push/callPush.js';
import { sendToEmployee } from '../../push/push.service.js';

export const SIGNALING_NAMESPACE = '/calls';
export const SIGNALING_PATH = '/api/calls/socket';

const STATUS_EVENTS = Object.freeze({
  ringing: 'call:incoming',
  accepted: 'call:accepted',
  rejected: 'call:rejected',
  cancelled: 'call:cancelled',
  missed: 'call:missed',
  ended: 'call:ended',
  failed: 'call:ended',
  busy: 'call:busy',
});

const SIGNAL_RATE = { windowMs: 10_000, max: 200 };

let state = null;

function roomOf(employeeId) {
  return `emp:${employeeId}`;
}

function isActive() {
  return Boolean(state?.namespace) && !state.closing;
}

function errorAck(err) {
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message };
  }
  console.error('[signaling] handler failed:', err?.message || err);
  return { ok: false, code: 'INTERNAL', message: 'حدث خطأ في الخادم' };
}

function signalForbidden() {
  // One answer for unknown call, non-participant, wrong state and wrong role,
  // so a socket cannot probe which call ids exist.
  return new AppError(403, ErrorCodes.CALL_FORBIDDEN, 'ليس لديك صلاحية لهذه المكالمة.');
}

/** Optional push token in an accept payload; anything odd is ignored. */
function pushTokenFrom(payload) {
  const token = payload?.pushToken;
  return typeof token === 'string' && /^[A-Za-z0-9_:\-.]{20,512}$/.test(token) ? token : null;
}

function callIdFrom(payload) {
  const callId = payload?.callId;
  if (typeof callId !== 'string' || callId.length === 0 || callId.length > 64) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'معرّف المكالمة غير صالح.');
  }
  return callId;
}

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

/**
 * Sends one state change to both participants, each with their own view, and
 * keeps the timers in step with the new status.
 *
 * @param {object} views  Output of `callService.buildParticipantViews`
 * @param {object} [options]
 * @param {string} [options.exceptSocketId] Socket that already got the result in its ack
 * @param {Date|string|null} [options.ringExpiresAt] Ring deadline, for the push TTL
 * @param {string|null} [options.answeringToken] Push token of the phone that answered
 */
function fanOut(views, { exceptSocketId = null, ringExpiresAt = null, answeringToken = null } = {}) {
  if (!isActive() || !views) return;
  const { namespace, timers } = state;
  const event = STATUS_EVENTS[views.status];
  if (!event) return;

  const callerRoom = namespace.to(roomOf(views.callerEmployeeId));
  const calleeRoom = namespace.to(roomOf(views.calleeEmployeeId));
  const toCaller = exceptSocketId ? callerRoom.except(exceptSocketId) : callerRoom;
  const toCallee = exceptSocketId ? calleeRoom.except(exceptSocketId) : calleeRoom;

  if (views.status !== 'ringing') {
    timers.clearRing(views.callId);
  }
  if (!['ringing', 'accepted'].includes(views.status)) {
    timers.clearGraceForCall(views.callId);
  }

  switch (views.status) {
    case 'ringing':
      // The caller's other devices learn about the outgoing call; the callee's
      // devices ring with the callee view (redacted when required).
      toCaller.emit('call:outgoing', views.caller);
      toCallee.emit('call:incoming', views.callee);
      break;
    case 'busy':
      // The callee is told nothing about a call they could not take.
      toCaller.emit('call:busy', views.caller);
      break;
    default:
      // For `call:accepted`, the callee's *other* devices receive it too: that
      // is their signal to stop ringing (answered on another device).
      toCaller.emit(event, views.caller);
      toCallee.emit(event, views.callee);
  }

  // Push in the background: it must never delay or break the socket fan-out.
  Promise.resolve()
    .then(() => state?.notifyPush?.(views, { ringExpiresAt, answeringToken }))
    .catch((err) => console.error('[push] call push failed:', err?.message || err));
}

async function publishLoadedCall(callId, options) {
  const loaded = await callService.loadCallById(callId);
  if (!loaded || !isActive()) return null;
  const views = await callService.buildParticipantViews(loaded);
  if (!isActive()) return null;
  if (views.status === 'ringing' && loaded.call.ringExpiresAt) {
    state.timers.armRing(callId, new Date(loaded.call.ringExpiresAt));
  }
  fanOut(views, { ...options, ringExpiresAt: loaded.call.ringExpiresAt ?? null });
  return views;
}

/**
 * Lets the REST controllers push their state changes to connected sockets, so
 * a REST accept and a socket accept look the same to the other side. Safe to
 * call when signalling is off (it does nothing).
 */
export function publishCallUpdate(callId) {
  if (!isActive() || !callId) return;
  publishLoadedCall(callId).catch((err) => {
    console.error('[signaling] publish failed:', err?.message || err);
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export function isSignalingActive() {
  return isActive();
}

/** Issues a one-time ticket plus the ICE servers for the signed-in user. */
export function issueSignalingTicket(user) {
  if (!isActive()) {
    throw new AppError(404, ErrorCodes.CALL_SIGNALING_DISABLED, 'خدمة المكالمات المباشرة غير مفعّلة.');
  }
  const { ticket, expiresAt } = state.tickets.issue({
    userId: user?.id,
    employeeId: user?.employeeId,
  });
  const iceServers = buildIceServers(env.callSignaling.ice);
  return {
    ticket,
    expiresAt,
    namespace: SIGNALING_NAMESPACE,
    path: SIGNALING_PATH,
    iceServers,
    turnConfigured: hasTurn(iceServers),
  };
}

// ---------------------------------------------------------------------------
// Timer callbacks
// ---------------------------------------------------------------------------

async function onRingExpired(callId) {
  const views = await callService.expireRingingCall(callId);
  if (views) fanOut(views);
}

async function onGraceExpired(_employeeId, callId) {
  const views = await callService.endCallForDisconnect(callId);
  if (views) fanOut(views);
}

async function bootSweep() {
  const rows = await callService.listRingingCallDeadlines();
  const current = Date.now();
  let expired = 0;
  for (const { callId, expiresAt } of rows) {
    if (expiresAt.getTime() <= current) {
      // Sequential on purpose: each expiry is its own transaction.
      // eslint-disable-next-line no-await-in-loop
      await onRingExpired(callId);
      expired += 1;
    } else {
      state.timers.armRing(callId, expiresAt);
    }
  }
  console.log(`[signaling] boot sweep: ${expired} expired, ${rows.length - expired} re-armed`);
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

function contextOf(socket) {
  return {
    actorUserId: socket.data.userId,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers?.['user-agent'],
  };
}

function on(socket, event, handler) {
  socket.on(event, async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!state || state.closing) {
      reply({ ok: false, code: ErrorCodes.CALL_SIGNALING_DISABLED, message: 'الخدمة قيد الإيقاف.' });
      return;
    }
    try {
      const result = await handler(payload ?? {});
      reply({ ok: true, ...(result || {}) });
    } catch (err) {
      reply(errorAck(err));
    }
  });
}

function registerHandlers(socket) {
  const { employeeId, userId } = socket.data;

  on(socket, 'call:invite', async (payload) => {
    if (!state.inviteRate.hit(userId)) {
      await callService.writeCallDenied({
        actorUserId: userId,
        callerEmployeeId: employeeId,
        targetEmployeeId: payload?.calleeEmployeeId ?? payload?.targetEmployeeId ?? null,
        reason: 'RATE_LIMITED',
        code: ErrorCodes.CALL_RATE_LIMITED,
        ...contextOf(socket),
      });
      throw new AppError(
        429,
        ErrorCodes.CALL_RATE_LIMITED,
        'تم تجاوز الحد المسموح من محاولات الاتصال. يرجى المحاولة لاحقاً.'
      );
    }

    const parsed = inviteCallSchema.safeParse(payload);
    if (!parsed.success || parsed.data.callType !== 'audio') {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'بيانات المكالمة غير صالحة.');
    }

    const { ip, userAgent } = contextOf(socket);
    const view = await callService.inviteCall({
      callerUser: { id: userId, employeeId },
      calleeEmployeeId: parsed.data.calleeEmployeeId,
      callType: 'audio',
      ip,
      userAgent,
      checkBusy: true,
    });

    await publishLoadedCall(view.id, { exceptSocketId: socket.id });
    return { call: view };
  });

  const action = (event, serviceFn) =>
    on(socket, event, async (payload) => {
      const callId = callIdFrom(payload);
      const view = await serviceFn(callId, employeeId, contextOf(socket));
      await publishLoadedCall(callId, {
        exceptSocketId: socket.id,
        // The answering phone sends its own push token so the "stop ringing"
        // push skips it (Phase D). Shape-checked only; never stored or logged.
        answeringToken: event === 'call:accept' ? pushTokenFrom(payload) : null,
      });
      return { call: view };
    });

  action('call:accept', callService.acceptCall);
  action('call:reject', callService.declineCall);
  action('call:cancel', callService.cancelCall);
  action('call:end', callService.endCall);

  on(socket, 'call:sync', async () => {
    state.timers.clearGraceForEmployee(employeeId);
    const calls = await callService.listActiveCallViews(employeeId);
    return { calls };
  });

  for (const kind of SIGNAL_KINDS) {
    on(socket, `signal:${kind}`, async (payload) => {
      if (!state.signalRate.hit(socket.id)) {
        throw new AppError(429, ErrorCodes.CALL_RATE_LIMITED, 'عدد الإشارات كبير جداً.');
      }

      const callId = callIdFrom(payload);
      const context = await callService.getSignalContext(callId, employeeId);
      if (!context || context.status !== 'accepted' || !canSendSignal(kind, context.role)) {
        throw signalForbidden();
      }

      const result = sanitizeSignal(kind, payload.data, { relayOnly: context.relayOnly });
      if (!result.ok) {
        throw new AppError(400, result.code, 'إشارة غير صالحة.');
      }
      if (result.drop) {
        return { dropped: true };
      }

      // Only the call id and the sanitized payload travel. No employee ids,
      // socket ids or names of the sender.
      state.namespace
        .to(roomOf(context.otherEmployeeId))
        .emit(`signal:${kind}`, { callId, data: result.data });
      return { dropped: false };
    });
  }

  socket.on('disconnect', () => {
    // During shutdown (or after it) there is nothing to arm: the boot sweep
    // and the next connection take over.
    if (!state || state.closing) return;
    const room = state.namespace.adapter.rooms.get(roomOf(employeeId));
    if (room && room.size > 0) return; // another device is still connected

    callService
      .listAcceptedCallIdsForEmployee(employeeId)
      .then((callIds) => {
        if (!state || state.closing) return;
        for (const callId of callIds) {
          state.timers.armGrace(employeeId, callId, env.callSignaling.disconnectGraceSeconds);
        }
      })
      .catch((err) => {
        console.error('[signaling] disconnect handling failed:', err?.message || err);
      });
  });
}

async function authenticateSocket(socket, next) {
  try {
    const principal = state.tickets.consume(socket.handshake.auth?.ticket);
    if (!principal) {
      return next(new Error(ErrorCodes.UNAUTHORIZED));
    }
    const participant = await callService.loadActiveParticipant(principal.employeeId);
    if (!participant) {
      return next(new Error(ErrorCodes.UNAUTHORIZED));
    }
    socket.data.userId = principal.userId;
    socket.data.employeeId = principal.employeeId;
    return next();
  } catch (err) {
    console.error('[signaling] handshake failed:', err?.message || err);
    return next(new Error(ErrorCodes.UNAUTHORIZED));
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Attaches signalling to the HTTP server. Returns `{ close }`, or null when
 * the feature flag is off.
 */
export async function attachSignaling(httpServer) {
  if (!env.callSignaling.enabled) return null;
  if (state) return { close: closeSignaling };

  // Loaded lazily so a server with the flag off never needs socket.io.
  const { Server } = await import('socket.io');

  const io = new Server(httpServer, {
    path: SIGNALING_PATH,
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
  });

  const namespace = io.of(SIGNALING_NAMESPACE);

  state = {
    io,
    namespace,
    tickets: createTicketStore({ ttlSeconds: env.callSignaling.ticketTtlSeconds }),
    timers: createCallTimers({ onRingExpired, onGraceExpired }),
    inviteRate: createRateWindow(env.callInviteRateLimit),
    signalRate: createRateWindow(SIGNAL_RATE),
    // Phase D: wake the callee's phones when the app is closed. A no-op while
    // PUSH_ENABLED is false.
    notifyPush: createCallPushNotifier({
      sendToEmployee,
      ringTimeoutSeconds: env.callSignaling.ringTimeoutSeconds,
      showCallerName: env.push.showCallerName,
    }),
  };

  namespace.use(authenticateSocket);
  namespace.on('connection', (socket) => {
    const { employeeId } = socket.data;
    socket.join(roomOf(employeeId));
    state.timers.clearGraceForEmployee(employeeId);
    registerHandlers(socket);
  });

  // Nothing but our namespace is served.
  io.of('/').use((_socket, next) => next(new Error(ErrorCodes.NOT_FOUND)));

  try {
    await bootSweep();
  } catch (err) {
    console.error('[signaling] boot sweep failed:', err?.message || err);
  }

  console.log(`[signaling] enabled on ${SIGNALING_PATH} namespace ${SIGNALING_NAMESPACE}`);
  return { close: closeSignaling };
}

export async function closeSignaling() {
  if (!state) return;
  const { io, namespace, timers } = state;
  // Mark the server as closing first: the disconnect handlers that fire below
  // must not arm grace timers that would end live calls on the way down.
  state.closing = true;
  timers.clearAll();
  // Not io.close(): that would also close the shared HTTP server, which
  // server.js closes itself during shutdown.
  namespace.disconnectSockets(true);
  io.engine.close();
  timers.clearAll();
  state = null;
}
