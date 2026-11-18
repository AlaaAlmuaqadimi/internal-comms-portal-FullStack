import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { getCallRedactedLabels } from '../settings/appSetting.service.js';
import {
  CALL_DENIAL_REASONS,
  evaluateCallPermission,
  isLeadershipKind,
} from './callAuth.service.js';
import { buildCallView } from './callView.service.js';
import { createMissedCallNotification } from './callNotifications.service.js';

const CALL_DENIED_MESSAGE = 'لا يمكن إجراء هذه المكالمة.';

const PARTICIPANT_SELECT = `
  SELECT e.id AS employee_id, e.full_name_ar, e.full_name_en, e.avatar_url,
         e.is_active, e.deleted_at,
         ou.id AS org_unit_id, ou.name_ar AS org_unit_name_ar,
         ou.name_en AS org_unit_name_en, ou.kind AS org_unit_kind
    FROM employees e
    JOIN org_units ou ON ou.id = e.org_unit_id
   WHERE e.id = ?
   LIMIT 1
`;

const CALL_SELECT = `
  SELECT c.id, c.caller_employee_id, c.callee_employee_id, c.call_type, c.status,
         c.initiated_at, c.answered_at, c.ended_at, c.duration_seconds,
         c.ended_reason, c.ring_expires_at, c.metadata,
         ce.full_name_ar AS caller_name_ar, ce.full_name_en AS caller_name_en,
         ce.avatar_url AS caller_avatar_url, ce.is_active AS caller_is_active,
         ce.deleted_at AS caller_deleted_at,
         cou.id AS caller_org_unit_id, cou.name_ar AS caller_org_unit_name_ar,
         cou.name_en AS caller_org_unit_name_en, cou.kind AS caller_org_unit_kind,
         ca.full_name_ar AS callee_name_ar, ca.full_name_en AS callee_name_en,
         ca.avatar_url AS callee_avatar_url, ca.is_active AS callee_is_active,
         ca.deleted_at AS callee_deleted_at,
         cau.id AS callee_org_unit_id, cau.name_ar AS callee_org_unit_name_ar,
         cau.name_en AS callee_org_unit_name_en, cau.kind AS callee_org_unit_kind
    FROM calls c
    JOIN employees ce ON ce.id = c.caller_employee_id
    JOIN employees ca ON ca.id = c.callee_employee_id
    JOIN org_units cou ON cou.id = ce.org_unit_id
    JOIN org_units cau ON cau.id = ca.org_unit_id
`;

function metadataOf(call) {
  const raw = call?.metadata;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapParticipant(row, prefix = '') {
  if (!row) return null;
  const read = (name) => row[`${prefix}${name}`];
  return {
    employeeId: read('employee_id') ?? read('id'),
    name: read('full_name_ar') ?? read('name_ar') ?? null,
    nameEn: read('full_name_en') ?? read('name_en') ?? null,
    avatarUrl: read('avatar_url') ?? null,
    unitId: read('org_unit_id') ?? null,
    unitName: read('org_unit_name_ar') ?? null,
    unitNameEn: read('org_unit_name_en') ?? null,
    orgUnitKind: read('org_unit_kind') ?? null,
    isActive: Number(read('is_active')) === 1,
    deletedAt: read('deleted_at') ?? null,
  };
}

function mapCallRow(row) {
  if (!row) return null;
  return {
    call: {
      id: row.id,
      callerEmployeeId: row.caller_employee_id,
      calleeEmployeeId: row.callee_employee_id,
      callType: row.call_type,
      status: row.status,
      initiatedAt: row.initiated_at,
      answeredAt: row.answered_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds,
      endedReason: row.ended_reason,
      ringExpiresAt: row.ring_expires_at ?? null,
      metadata: row.metadata,
    },
    caller: mapParticipant(row, 'caller_'),
    callee: mapParticipant(row, 'callee_'),
  };
}

async function loadParticipant(executor, employeeId) {
  if (!employeeId) return null;
  const [rows] = await executor.execute(PARTICIPANT_SELECT, [employeeId]);
  return rows[0] ? mapParticipant(rows[0]) : null;
}

async function loadCall(executor, callId) {
  const [rows] = await executor.execute(
    `${CALL_SELECT} WHERE c.id = ? LIMIT 1`,
    [callId]
  );
  return mapCallRow(rows[0]);
}

/**
 * Loads a call with both participants for the signalling layer. `executor` may
 * be a transaction connection.
 */
export async function loadCallById(callId, executor = pool) {
  return loadCall(executor, callId);
}

function isCallParticipant(call, employeeId) {
  return Boolean(
    employeeId &&
      (call.callerEmployeeId === employeeId || call.calleeEmployeeId === employeeId)
  );
}

export async function writeCallDenied({
  actorUserId = null,
  callId = null,
  callerEmployeeId = null,
  targetEmployeeId = null,
  callerKind = null,
  targetKind = null,
  callType = null,
  reason,
  code,
  ip,
  userAgent,
}) {
  const metadata = JSON.stringify({
    reason,
    code,
    callerEmployeeId,
    targetEmployeeId,
    callerOrgUnitKind: callerKind,
    targetOrgUnitKind: targetKind,
    callType,
  });

  await pool
    .execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata, ip, user_agent)
       VALUES (?, 'call.denied', 'call', ?, ?, ?, ?)`,
      [
        actorUserId,
        callId,
        metadata,
        ip || null,
        userAgent || null,
      ]
    )
    .catch(() => {
      // The denial response must not turn into a 500 because the audit write
      // failed; the normal path has a working database connection.
    });
}

function targetDeniedError(code) {
  if (code === ErrorCodes.CALLER_INACTIVE) {
    return new AppError(403, ErrorCodes.CALLER_INACTIVE, 'الحساب غير نشط.');
  }
  return new AppError(403, ErrorCodes.CALL_TARGET_FORBIDDEN, CALL_DENIED_MESSAGE);
}

function notFoundError() {
  return new AppError(404, ErrorCodes.CALL_NOT_FOUND, 'المكالمة غير موجودة.');
}

function forbiddenError() {
  return new AppError(403, ErrorCodes.CALL_FORBIDDEN, 'ليس لديك صلاحية لهذه المكالمة.');
}

function invalidStateError() {
  return new AppError(
    409,
    ErrorCodes.CALL_INVALID_STATE,
    'لا يمكن تنفيذ هذا الإجراء على المكالمة في حالتها الحالية.'
  );
}

async function viewFor(loaded, viewerEmployeeId, labels) {
  return buildCallView({
    call: loaded.call,
    viewerEmployeeId,
    caller: loaded.caller,
    callee: loaded.callee,
    labels,
  });
}

/**
 * Creates a ringing call after applying the pure authorization policy.
 * A denied invite always writes `call.denied` before throwing. The thrown
 * response is identical for an existing leadership target, an inactive target
 * and an unknown target.
 */
export async function inviteCall({
  callerUser,
  calleeEmployeeId,
  callType = 'audio',
  ip,
  userAgent,
  // The signalling layer turns this on. The REST invite keeps the Phase A
  // behaviour (no busy handling) so existing clients are unaffected.
  checkBusy = false,
}) {
  const caller = await loadParticipant(pool, callerUser?.employeeId);
  const target = await loadParticipant(pool, calleeEmployeeId);
  const decision = evaluateCallPermission(caller, target);

  if (!decision.allowed) {
    await writeCallDenied({
      actorUserId: callerUser?.id ?? null,
      callerEmployeeId: callerUser?.employeeId ?? null,
      targetEmployeeId: calleeEmployeeId ?? null,
      callerKind: caller?.orgUnitKind ?? null,
      targetKind: target?.orgUnitKind ?? null,
      callType,
      reason: decision.reason,
      code: decision.code,
      ip,
      userAgent,
    });
    throw targetDeniedError(decision.code);
  }

  // Busy is checked only after the policy allowed the call, so a busy
  // Director/Deputy is still indistinguishable from any other forbidden target.
  let initialStatus = 'ringing';
  if (checkBusy) {
    if (await isEmployeeBusy(caller.employeeId)) {
      await writeCallDenied({
        actorUserId: callerUser?.id ?? null,
        callerEmployeeId: caller.employeeId,
        targetEmployeeId: target.employeeId,
        callerKind: caller.orgUnitKind,
        targetKind: target.orgUnitKind,
        callType,
        reason: 'CALLER_BUSY',
        code: ErrorCodes.CALL_INVALID_STATE,
        ip,
        userAgent,
      });
      throw invalidStateError();
    }
    if (await isEmployeeBusy(target.employeeId)) {
      initialStatus = 'busy';
    }
  }

  const callerIsLeadership = isLeadershipKind(caller.orgUnitKind);
  const calleeIsLeadership = isLeadershipKind(target.orgUnitKind);
  const redacted = callerIsLeadership && !calleeIsLeadership;
  const id = crypto.randomUUID();

  try {
    await pool.execute(
      `INSERT INTO calls
         (id, caller_employee_id, callee_employee_id, call_type, status,
          ring_expires_at, ended_at, ended_reason, metadata)
       VALUES (?, ?, ?, ?, ?,
               IF(? = 'ringing', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), NULL),
               IF(? = 'busy', UTC_TIMESTAMP(3), NULL),
               IF(? = 'busy', 'busy', NULL),
               ?)`,
      [
        id,
        caller.employeeId,
        target.employeeId,
        callType,
        initialStatus,
        initialStatus,
        env.callSignaling.ringTimeoutSeconds,
        initialStatus,
        initialStatus,
        JSON.stringify({
          callerOrgUnitKind: caller.orgUnitKind,
          calleeOrgUnitKind: target.orgUnitKind,
          callerLeadership: callerIsLeadership,
          calleeLeadership: calleeIsLeadership,
          relayOnly: callerIsLeadership,
          redaction: redacted ? 'leadership' : null,
        }),
      ]
    );
  } catch (err) {
    // The target can be deleted between the policy check and the insert.
    if (err && (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW')) {
      await writeCallDenied({
        actorUserId: callerUser?.id ?? null,
        callerEmployeeId: caller.employeeId,
        targetEmployeeId: calleeEmployeeId,
        callerKind: caller.orgUnitKind,
        targetKind: target?.orgUnitKind ?? null,
        callType,
        reason: CALL_DENIAL_REASONS.TARGET_NOT_FOUND,
        code: ErrorCodes.CALL_TARGET_FORBIDDEN,
        ip,
        userAgent,
      });
      throw targetDeniedError(ErrorCodes.CALL_TARGET_FORBIDDEN);
    }
    throw err;
  }

  const loaded = await loadCall(pool, id);
  const labels = await getCallRedactedLabels();
  return viewFor(loaded, caller.employeeId, labels);
}

/** History for one participant, newest first. */
export async function listCalls(employeeId) {
  const [rows] = await pool.execute(
    `${CALL_SELECT}
      WHERE c.caller_employee_id = ? OR c.callee_employee_id = ?
      ORDER BY c.initiated_at DESC
      LIMIT 100`,
    [employeeId, employeeId]
  );

  const labels = await getCallRedactedLabels();
  return rows
    .map((row) => mapCallRow(row))
    .filter(Boolean)
    .map((loaded) => buildCallView({
      call: loaded.call,
      viewerEmployeeId: employeeId,
      caller: loaded.caller,
      callee: loaded.callee,
      labels,
    }));
}

/**
 * Active calls for the signalling `call:sync` response. "Active" here means
 * ringing or accepted; terminal calls belong to history, not to the live call
 * UI.
 */
export async function listActiveCallViews(employeeId) {
  const [rows] = await pool.execute(
    `${CALL_SELECT}
      WHERE (c.caller_employee_id = ? OR c.callee_employee_id = ?)
        AND c.status IN ('ringing', 'accepted')
      ORDER BY c.initiated_at DESC`,
    [employeeId, employeeId]
  );

  const labels = await getCallRedactedLabels();
  return rows
    .map((row) => mapCallRow(row))
    .filter(Boolean)
    .map((loaded) => viewFor(loaded, employeeId, labels));
}

/** One authorized call view for the socket layer; audits non-participants. */
export async function getCallViewForEmployee(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);
  return viewFor(loaded, viewerEmployeeId, await getCallRedactedLabels());
}

/**
 * Busy means the employee has a ringing or accepted call in either direction.
 * Presence is deliberately not part of this rule.
 */
export async function isEmployeeBusy(employeeId, { excludeCallId = null } = {}) {
  const params = [employeeId, employeeId];
  let exclusion = '';
  if (excludeCallId) {
    exclusion = 'AND c.id <> ?';
    params.push(excludeCallId);
  }

  const [rows] = await pool.execute(
    `SELECT c.id
       FROM calls c
      WHERE (c.caller_employee_id = ? OR c.callee_employee_id = ?)
        AND c.status IN ('ringing', 'accepted')
        ${exclusion}
      LIMIT 1`,
    params
  );
  return rows.length > 0;
}

/** Accepted call ids for the disconnect-grace path. */
export async function listAcceptedCallIdsForEmployee(employeeId) {
  const [rows] = await pool.execute(
    `SELECT c.id
       FROM calls c
      WHERE (c.caller_employee_id = ? OR c.callee_employee_id = ?)
        AND c.status = 'accepted'
      ORDER BY c.initiated_at DESC`,
    [employeeId, employeeId]
  );
  return rows.map((row) => row.id);
}

/**
 * Administrative oversight feed.
 *
 * Only an admin or auditor reaches this function (see
 * `middleware/requireCallOversight.js`). It returns calls that involved the
 * Director or Deputy, selected from the org-unit-kind snapshot stored in
 * `calls.metadata`, and exposes that metadata only:
 *
 *   - no caller/callee names, avatars, employee ids or org-unit ids
 *   - no SDP, ICE candidates or phone numbers (none are ever stored on a call)
 *
 * The redacted view and this metadata-only oversight feed are deliberately
 * separate read paths; an oversight role never gets the unredacted call view.
 */
function oversightLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 200);
}

export async function listOversightCalls({ limit } = {}) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.status, c.call_type, c.initiated_at, c.answered_at,
            c.ended_at, c.duration_seconds, c.ended_reason, c.metadata
       FROM calls c
      WHERE JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.callerOrgUnitKind')) IN ('root', 'deputy')
         OR JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.calleeOrgUnitKind')) IN ('root', 'deputy')
      ORDER BY c.initiated_at DESC
      LIMIT ${oversightLimit(limit)}`
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    callType: row.call_type,
    initiatedAt: isoOrNull(row.initiated_at),
    answeredAt: isoOrNull(row.answered_at),
    endedAt: isoOrNull(row.ended_at),
    durationSeconds: Number(row.duration_seconds ?? 0),
    endedReason: row.ended_reason ?? null,
    metadata: metadataOf({ metadata: row.metadata }),
  }));
}

export async function getCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await loadCall(pool, callId);
  if (!loaded) throw notFoundError();

  if (!isCallParticipant(loaded.call, viewerEmployeeId)) {
    await writeCallDenied({
      actorUserId: ctx.actorUserId ?? null,
      callId,
      callerEmployeeId: loaded.call.callerEmployeeId,
      targetEmployeeId: loaded.call.calleeEmployeeId,
      callerKind: loaded.caller?.orgUnitKind ?? null,
      targetKind: loaded.callee?.orgUnitKind ?? null,
      callType: loaded.call.callType,
      reason: 'NOT_PARTICIPANT',
      code: ErrorCodes.CALL_FORBIDDEN,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw forbiddenError();
  }

  const labels = await getCallRedactedLabels();
  return viewFor(loaded, viewerEmployeeId, labels);
}

async function requireCallForAction(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await loadCall(pool, callId);
  if (!loaded) throw notFoundError();

  if (!isCallParticipant(loaded.call, viewerEmployeeId)) {
    await writeCallDenied({
      actorUserId: ctx.actorUserId ?? null,
      callId,
      callerEmployeeId: loaded.call.callerEmployeeId,
      targetEmployeeId: loaded.call.calleeEmployeeId,
      callerKind: loaded.caller?.orgUnitKind ?? null,
      targetKind: loaded.callee?.orgUnitKind ?? null,
      callType: loaded.call.callType,
      reason: 'NOT_PARTICIPANT',
      code: ErrorCodes.CALL_FORBIDDEN,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw forbiddenError();
  }

  return loaded;
}

async function denyInvalidState(loaded, viewerEmployeeId, ctx, reason) {
  await writeCallDenied({
    actorUserId: ctx.actorUserId ?? null,
    callId: loaded.call.id,
    callerEmployeeId: loaded.call.callerEmployeeId,
    targetEmployeeId: loaded.call.calleeEmployeeId,
    callerKind: loaded.caller?.orgUnitKind ?? null,
    targetKind: loaded.callee?.orgUnitKind ?? null,
    callType: loaded.call.callType,
    reason,
    code: ErrorCodes.CALL_INVALID_STATE,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  throw invalidStateError();
}

async function denyWrongParty(loaded, ctx, reason) {
  await writeCallDenied({
    actorUserId: ctx.actorUserId ?? null,
    callId: loaded.call.id,
    callerEmployeeId: loaded.call.callerEmployeeId,
    targetEmployeeId: loaded.call.calleeEmployeeId,
    callerKind: loaded.caller?.orgUnitKind ?? null,
    targetKind: loaded.callee?.orgUnitKind ?? null,
    callType: loaded.call.callType,
    reason,
    code: ErrorCodes.CALL_FORBIDDEN,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  throw forbiddenError();
}

export async function acceptCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);

  if (loaded.call.calleeEmployeeId !== viewerEmployeeId) {
    await denyWrongParty(loaded, ctx, 'ONLY_CALLEE_CAN_ACCEPT');
  }
  if (loaded.call.status !== 'ringing') {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_RINGING');
  }

  const [result] = await pool.execute(
    `UPDATE calls
        SET status = 'accepted', answered_at = UTC_TIMESTAMP(3)
      WHERE id = ? AND status = 'ringing'`,
    [callId]
  );
  if (result.affectedRows !== 1) {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_RINGING');
  }

  const fresh = await loadCall(pool, callId);
  return viewFor(fresh, viewerEmployeeId, await getCallRedactedLabels());
}

export async function declineCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);

  if (loaded.call.calleeEmployeeId !== viewerEmployeeId) {
    await denyWrongParty(loaded, ctx, 'ONLY_CALLEE_CAN_DECLINE');
  }
  if (loaded.call.status !== 'ringing') {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_RINGING');
  }

  await pool.execute(
    `UPDATE calls
        SET status = 'rejected', ended_at = UTC_TIMESTAMP(3), ended_reason = 'rejected'
      WHERE id = ? AND status = 'ringing'`,
    [callId]
  );

  // Q4: a rejected call does not create a notification.
  const fresh = await loadCall(pool, callId);
  return viewFor(fresh, viewerEmployeeId, await getCallRedactedLabels());
}

export async function cancelCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);

  if (loaded.call.callerEmployeeId !== viewerEmployeeId) {
    await denyWrongParty(loaded, ctx, 'ONLY_CALLER_CAN_CANCEL');
  }
  if (loaded.call.status !== 'ringing') {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_RINGING');
  }

  const labels = await getCallRedactedLabels();

  // Phase B deliberately changes the Phase A behaviour: a call the caller
  // abandons while it is ringing is a missed call from the callee's point of
  // view, so it creates the same single `missed_call` notification.
  const fresh = await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE calls
          SET status = 'cancelled', ended_at = UTC_TIMESTAMP(3), ended_reason = 'cancelled'
        WHERE id = ? AND status = 'ringing'`,
      [callId]
    );
    if (result.affectedRows !== 1) {
      throw invalidStateError();
    }

    const current = await loadCall(conn, callId);
    await createMissedCallNotification({
      call: current.call,
      caller: current.caller,
      callee: current.callee,
      labels,
      executor: conn,
    });
    return current;
  });

  return viewFor(fresh, viewerEmployeeId, labels);
}

export async function endCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);
  if (loaded.call.status !== 'accepted') {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_ACCEPTED');
  }

  await pool.execute(
    `UPDATE calls
        SET status = 'ended',
            ended_at = UTC_TIMESTAMP(3),
            ended_reason = 'ended',
            duration_seconds = GREATEST(
              0,
              TIMESTAMPDIFF(SECOND, COALESCE(answered_at, initiated_at), UTC_TIMESTAMP(3))
            )
      WHERE id = ? AND status = 'accepted'`,
    [callId]
  );

  const fresh = await loadCall(pool, callId);
  return viewFor(fresh, viewerEmployeeId, await getCallRedactedLabels());
}

/**
 * Marks a ringing call as missed and creates the single notification type that
 * calls are allowed to generate (missed_call). Declines, cancellations and
 * successful calls create no notification.
 */
export async function missCall(callId, viewerEmployeeId, ctx = {}) {
  const loaded = await requireCallForAction(callId, viewerEmployeeId, ctx);

  if (loaded.call.calleeEmployeeId !== viewerEmployeeId) {
    await denyWrongParty(loaded, ctx, 'ONLY_CALLEE_CAN_MISS');
  }
  if (loaded.call.status !== 'ringing') {
    await denyInvalidState(loaded, viewerEmployeeId, ctx, 'NOT_RINGING');
  }

  const labels = await getCallRedactedLabels();

  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE calls
          SET status = 'missed', ended_at = UTC_TIMESTAMP(3), ended_reason = 'missed'
        WHERE id = ? AND status = 'ringing'`,
      [callId]
    );
    if (result.affectedRows !== 1) {
      throw invalidStateError();
    }

    const metadata = metadataOf(loaded.call);
    const callerKind =
      metadata.callerOrgUnitKind ?? loaded.caller?.orgUnitKind ?? null;
    const calleeKind =
      metadata.calleeOrgUnitKind ?? loaded.callee?.orgUnitKind ?? null;
    const redacted = isLeadershipKind(callerKind) && !isLeadershipKind(calleeKind);
    const displayName = redacted
      ? redactedLabelForKind(callerKind, labels)
      : loaded.caller?.name || 'موظف';

    const notificationId = crypto.randomUUID();
    const summary = `مكالمة فائتة من ${displayName}`;

    await conn.execute(
      `INSERT INTO notifications
         (id, type, title_ar, summary_ar, body_ar, icon, audience,
          created_by_user_id, published_at, expires_at, metadata)
       VALUES (?, 'missed_call', 'مكالمة فائتة', ?, ?, 'call', 'selected',
               NULL, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY), ?)`,
      [
        notificationId,
        summary,
        summary,
        // The notification payload carries the minimum needed to render the
        // row: the call id and the already-redacted display label. It never
        // contains employee ids, org-unit kinds or the original name.
        JSON.stringify({ callId, label: displayName }),
      ]
    );

    await conn.execute(
      `INSERT INTO notification_recipients
         (notification_id, employee_id, delivered_at, read_at)
       VALUES (?, ?, UTC_TIMESTAMP(3), NULL)`,
      [notificationId, loaded.call.calleeEmployeeId]
    );
  });

  const fresh = await loadCall(pool, callId);
  return viewFor(fresh, viewerEmployeeId, labels);
}

// ---------------------------------------------------------------------------
// Signalling (Phase B) helpers
//
// These are used only by `signaling/signaling.server.js`. Every state change
// keeps the same `WHERE status = ...` guard as the REST actions, so a timer or
// socket event that races a REST call can never apply twice.
// ---------------------------------------------------------------------------

/** Active, non-deleted participant for the socket handshake, or null. */
export async function loadActiveParticipant(employeeId) {
  const participant = await loadParticipant(pool, employeeId);
  if (!participant) return null;
  if (participant.isActive === false || participant.deletedAt) return null;
  return participant;
}

/**
 * Both participants' views of one call, built with one label lookup. Used to
 * fan out a state change: each side receives only its own view, so a redacted
 * callee never receives the caller's identity.
 */
export async function buildParticipantViews(loaded, labels = null) {
  if (!loaded) return null;
  const resolvedLabels = labels ?? (await getCallRedactedLabels());
  const [callerView, calleeView] = await Promise.all([
    viewFor(loaded, loaded.call.callerEmployeeId, resolvedLabels),
    viewFor(loaded, loaded.call.calleeEmployeeId, resolvedLabels),
  ]);
  return {
    callId: loaded.call.id,
    callerEmployeeId: loaded.call.callerEmployeeId,
    calleeEmployeeId: loaded.call.calleeEmployeeId,
    status: loaded.call.status,
    relayOnly: Boolean(callerView?.relayOnly),
    caller: callerView,
    callee: calleeView,
  };
}

/**
 * Ring timeout: `ringing -> missed` plus exactly one `missed_call`
 * notification, in one transaction. Returns the participant views, or null
 * when the call had already left `ringing` (accepted, rejected, cancelled...).
 */
export async function expireRingingCall(callId) {
  const labels = await getCallRedactedLabels();

  const loaded = await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE calls
          SET status = 'missed', ended_at = UTC_TIMESTAMP(3), ended_reason = 'timeout'
        WHERE id = ? AND status = 'ringing'`,
      [callId]
    );
    if (result.affectedRows !== 1) return null;

    const current = await loadCall(conn, callId);
    await createMissedCallNotification({
      call: current.call,
      caller: current.caller,
      callee: current.callee,
      labels,
      executor: conn,
    });
    return current;
  });

  return loaded ? buildParticipantViews(loaded, labels) : null;
}

/**
 * Every ringing call with its ring deadline, for the boot sweep. Rows created
 * before V020 have no `ring_expires_at`, so they fall back to
 * `initiated_at + CALL_RING_TIMEOUT_SECONDS`.
 */
export async function listRingingCallDeadlines() {
  const [rows] = await pool.execute(
    `SELECT id,
            COALESCE(ring_expires_at,
                     DATE_ADD(initiated_at, INTERVAL ? SECOND)) AS expires_at
       FROM calls
      WHERE status = 'ringing'`,
    [env.callSignaling.ringTimeoutSeconds]
  );
  return rows.map((row) => ({
    callId: row.id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
  }));
}

/**
 * Disconnect grace expired: `accepted -> ended` with
 * `ended_reason = 'disconnected'`. Returns the participant views, or null when
 * the call was no longer accepted. No notification is created.
 */
export async function endCallForDisconnect(callId) {
  const [result] = await pool.execute(
    `UPDATE calls
        SET status = 'ended',
            ended_at = UTC_TIMESTAMP(3),
            ended_reason = 'disconnected',
            duration_seconds = GREATEST(
              0,
              TIMESTAMPDIFF(SECOND, COALESCE(answered_at, initiated_at), UTC_TIMESTAMP(3))
            )
      WHERE id = ? AND status = 'accepted'`,
    [callId]
  );
  if (result.affectedRows !== 1) return null;
  return buildParticipantViews(await loadCall(pool, callId));
}

/**
 * Lightweight participant check for relaying signals. Returns
 * `{ role, status, relayOnly, otherEmployeeId }` or null for a non-participant
 * or unknown call. Never throws for an unknown id, so the socket layer can
 * answer every bad signal with the same error.
 */
export async function getSignalContext(callId, employeeId) {
  if (!callId || !employeeId) return null;
  const [rows] = await pool.execute(
    `SELECT id, caller_employee_id, callee_employee_id, status, metadata
       FROM calls
      WHERE id = ?
      LIMIT 1`,
    [callId]
  );
  const row = rows[0];
  if (!row) return null;

  let role = null;
  if (row.caller_employee_id === employeeId) role = 'caller';
  else if (row.callee_employee_id === employeeId) role = 'callee';
  if (!role) return null;

  const metadata = metadataOf({ metadata: row.metadata });
  return {
    role,
    status: row.status,
    relayOnly: Boolean(metadata.relayOnly ?? metadata.callerLeadership),
    otherEmployeeId: role === 'caller' ? row.callee_employee_id : row.caller_employee_id,
  };
}
