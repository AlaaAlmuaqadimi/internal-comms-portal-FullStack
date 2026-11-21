/**
 * Unit heads (مدير الوحدة).
 *
 * A directorate, office or section may name one head, chosen explicitly by an
 * admin. Being a unit head is what lets an employee call the Director and the
 * Deputy (see calls/callAuth.service.js). The rules live here so user
 * creation, employee edits and any later org screen share them:
 *
 *   - only directorates, offices and sections have heads (the Director's and
 *     the Deputy's own units already make them leadership);
 *   - the head must be an active employee OF that unit;
 *   - one head per unit, one unit per head (database UNIQUE as well);
 *   - replacing an existing head needs `replace: true`, otherwise 409
 *     UNIT_HEAD_EXISTS naming the current head, so the admin confirms it.
 *
 * Every function takes the open transaction connection.
 */
import { AppError, ErrorCodes } from '../../lib/errors.js';

export const HEADED_UNIT_KINDS = Object.freeze(['directorate', 'office', 'section']);

export function canHaveHead(kind) {
  return HEADED_UNIT_KINDS.includes(kind);
}

/** Removes the employee as head of whatever unit they head (no-op if none). */
export async function clearHeadForEmployee(conn, employeeId) {
  if (!employeeId) return;
  await conn.execute('UPDATE org_units SET head_employee_id = NULL WHERE head_employee_id = ?', [
    employeeId,
  ]);
}

/**
 * Makes `employeeId` the head of `unitId`.
 * @returns {Promise<{previousHeadEmployeeId: string|null}>}
 */
export async function setUnitHead(conn, { unitId, employeeId, replace = false }) {
  const [units] = await conn.execute(
    `SELECT u.id, u.kind, u.head_employee_id, h.full_name_ar AS head_name
       FROM org_units u
       LEFT JOIN employees h ON h.id = u.head_employee_id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
    [unitId]
  );
  const unit = units[0];
  if (!unit) {
    throw new AppError(404, ErrorCodes.ORG_UNIT_NOT_FOUND, 'Org unit not found');
  }
  if (!canHaveHead(unit.kind)) {
    throw new AppError(422, ErrorCodes.UNIT_HEAD_NOT_ALLOWED,
      'Only a directorate, office or section can have a head.',
      [{ field: 'isUnitHead', message: 'هذه الوحدة لا تقبل مديراً.' }]);
  }

  const [employees] = await conn.execute(
    `SELECT id FROM employees
      WHERE id = ? AND org_unit_id = ? AND is_active = 1 AND deleted_at IS NULL
      LIMIT 1`,
    [employeeId, unitId]
  );
  if (employees.length === 0) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR,
      'The head must be an active employee of this unit.',
      [{ field: 'isUnitHead', message: 'مدير الوحدة يجب أن يكون موظفاً نشطاً فيها.' }]);
  }

  const previous = unit.head_employee_id || null;
  if (previous === employeeId) return { previousHeadEmployeeId: previous };
  if (previous && !replace) {
    throw new AppError(409, ErrorCodes.UNIT_HEAD_EXISTS,
      `This unit already has a head: ${unit.head_name || ''}`.trim(),
      [{ field: 'isUnitHead', message: `للوحدة مدير حالياً: ${unit.head_name || ''}`.trim(),
        currentHeadEmployeeId: previous, currentHeadName: unit.head_name || null }]);
  }

  // Free the person from any other unit first (UNIQUE head_employee_id).
  await clearHeadForEmployee(conn, employeeId);
  await conn.execute('UPDATE org_units SET head_employee_id = ? WHERE id = ?', [employeeId, unitId]);
  return { previousHeadEmployeeId: previous };
}

/**
 * Applies the head flag after an employee row was written.
 *   isUnitHead true  -> head of their (new) unit
 *   isUnitHead false -> no longer head of anything
 *   undefined        -> unchanged, except that moving unit or deactivating
 *                       always drops a head role they held elsewhere
 */
export async function applyHeadFlag(conn, { employeeId, unitId, isUnitHead, replace, isActive = true }) {
  if (!isActive || isUnitHead === false) {
    await clearHeadForEmployee(conn, employeeId);
    return;
  }
  if (isUnitHead === true) {
    await setUnitHead(conn, { unitId, employeeId, replace });
    return;
  }
  // Unchanged flag: keep it only if they still head the unit they are in.
  await conn.execute(
    'UPDATE org_units SET head_employee_id = NULL WHERE head_employee_id = ? AND id <> ?',
    [employeeId, unitId]
  );
}
