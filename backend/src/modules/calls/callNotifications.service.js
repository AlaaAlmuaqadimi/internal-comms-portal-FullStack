/**
 * The single place that writes a `missed_call` notification.
 *
 * Phase A wrote the rows inline in `call.service.missCall`. Phase B adds two
 * more callers (the ring timeout / boot sweep and a caller cancel before
 * answer), so the insert lives here instead of being copied.
 *
 * The metadata payload is deliberately tiny: `{ callId, label }` where `label`
 * is already redacted for a leadership caller. It never contains employee ids,
 * org-unit kinds, SDP, ICE candidates or phone numbers.
 */
import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { isLeadershipKind } from './callAuth.service.js';
import { redactedLabelForKind } from './callView.service.js';

export const MISSED_CALL_TITLE = 'مكالمة فائتة';

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

/**
 * Resolves the caller display name for a missed-call notification.
 *
 * The org-unit kind snapshot stored on the call wins over the live participant
 * row, so moving an employee out of the root unit cannot retroactively
 * de-anonymize an old call. The label itself is read live from `app_settings`
 * by the caller and passed in.
 */
export function resolveMissedCallDisplay({ call, caller, callee, labels } = {}) {
  const metadata = metadataOf(call);
  const callerKind = metadata.callerOrgUnitKind ?? caller?.orgUnitKind ?? null;
  const calleeKind = metadata.calleeOrgUnitKind ?? callee?.orgUnitKind ?? null;
  const redacted = isLeadershipKind(callerKind) && !isLeadershipKind(calleeKind);
  const displayName = redacted
    ? redactedLabelForKind(callerKind, labels)
    : caller?.name || 'موظف';

  return { displayName, redacted };
}

/**
 * Inserts exactly one notification and one recipient row.
 *
 * @param {object} input
 * @param {object} input.call   Loaded call (`{ id, calleeEmployeeId, metadata }`)
 * @param {object} [input.caller] Loaded caller participant
 * @param {object} [input.callee] Loaded callee participant
 * @param {object} [input.labels] `{ director, deputy }`
 * @param {object} [input.executor] A pool connection inside a transaction
 * @returns {Promise<{notificationId: string, callId: string, calleeEmployeeId: string, label: string}>}
 */
export async function createMissedCallNotification({
  call,
  caller,
  callee,
  labels,
  executor,
} = {}) {
  const db = executor ?? pool;
  const callId = call?.id ?? call?.callId ?? null;
  const calleeEmployeeId =
    call?.calleeEmployeeId ?? call?.callee_employee_id ?? callee?.employeeId ?? null;

  if (!callId || !calleeEmployeeId) {
    throw new Error('createMissedCallNotification requires a call id and callee');
  }

  const { displayName } = resolveMissedCallDisplay({ call, caller, callee, labels });
  const summary = `${MISSED_CALL_TITLE} من ${displayName}`;
  const notificationId = crypto.randomUUID();

  await db.execute(
    `INSERT INTO notifications
       (id, type, title_ar, summary_ar, body_ar, icon, audience,
        created_by_user_id, published_at, expires_at, metadata)
     VALUES (?, 'missed_call', ?, ?, ?, 'call', 'selected',
             NULL, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY), ?)`,
    [
      notificationId,
      MISSED_CALL_TITLE,
      summary,
      summary,
      JSON.stringify({ callId, label: displayName }),
    ]
  );

  await db.execute(
    `INSERT INTO notification_recipients
       (notification_id, employee_id, delivered_at, read_at)
     VALUES (?, ?, UTC_TIMESTAMP(3), NULL)`,
    [notificationId, calleeEmployeeId]
  );

  return { notificationId, callId, calleeEmployeeId, label: displayName };
}

export default createMissedCallNotification;
