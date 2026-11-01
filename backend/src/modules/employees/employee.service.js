import crypto from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { findAvailableUsername } from '../../lib/username.js';

const EMPLOYEE_COLUMNS = `
  e.id,
  e.code,
  e.full_name_ar,
  e.full_name_en,
  e.job_title_ar,
  e.job_title_en,
  e.email,
  e.extension,
  e.avatar_url,
  e.presence,
  e.is_active,
  e.org_unit_id,
  ou.name_ar AS org_unit_name_ar,
  ou.name_en AS org_unit_name_en,
  ou.kind AS org_unit_kind,
  ou.parent_id AS parent_unit_id,
  pu.name_ar AS parent_unit_name_ar,
  pu.name_en AS parent_unit_name_en,
  u.id AS user_id,
  u.username,
  EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND r.code = 'admin'
  ) AS is_admin
`;

const EMPLOYEE_JOINS = `
  FROM employees e
  JOIN org_units ou ON ou.id = e.org_unit_id
  LEFT JOIN org_units pu ON pu.id = ou.parent_id
  LEFT JOIN users u ON u.employee_id = e.id AND u.deleted_at IS NULL
`;

function mapEmployee(row) {
  if (!row) return null;
  const isAdmin = Number(row.is_admin) === 1;
  return {
    id: row.id,
    employeeId: row.id,
    code: row.code,
    fullNameAr: row.full_name_ar,
    fullNameEn: row.full_name_en ?? null,
    jobTitleAr: row.job_title_ar ?? null,
    jobTitleEn: row.job_title_en ?? null,
    email: row.email ?? null,
    extension: row.extension ?? null,
    avatarUrl: row.avatar_url ?? null,
    presence: row.presence,
    isActive: Number(row.is_active) === 1,
    orgUnitId: row.org_unit_id,
    orgUnitNameAr: row.org_unit_name_ar ?? null,
    orgUnitNameEn: row.org_unit_name_en ?? null,
    orgUnitKind: row.org_unit_kind ?? null,
    parentUnitId: row.parent_unit_id ?? null,
    parentUnitNameAr: row.parent_unit_name_ar ?? null,
    parentUnitNameEn: row.parent_unit_name_en ?? null,
    userId: row.user_id ?? null,
    username: row.username ?? null,
    hasAccount: !!row.user_id,
    roleCode: isAdmin ? 'admin' : 'employee',
    isAdmin,
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function duplicateError(code, message, field) {
  return new AppError(409, code, message, [{ field, message }]);
}

async function fetchEmployee(executor, employeeId) {
  const [rows] = await executor.execute(
    `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_JOINS}
     WHERE e.id = ? AND e.deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return mapEmployee(rows[0]);
}

async function assertEmailAvailable(executor, email, excludeEmployeeId) {
  const [rows] = await executor.execute(
    excludeEmployeeId
      ? 'SELECT id FROM employees WHERE email = ? AND id <> ? LIMIT 1'
      : 'SELECT id FROM employees WHERE email = ? LIMIT 1',
    excludeEmployeeId ? [email, excludeEmployeeId] : [email]
  );
  if (rows.length > 0) {
    throw duplicateError(
      ErrorCodes.EMAIL_TAKEN,
      'This email address is already registered.',
      'email'
    );
  }
}

async function assertExtensionAvailable(executor, extension, excludeEmployeeId) {
  const [rows] = await executor.execute(
    excludeEmployeeId
      ? `SELECT id FROM employees
         WHERE extension = ? AND is_active = 1 AND deleted_at IS NULL AND id <> ?
         LIMIT 1`
      : `SELECT id FROM employees
         WHERE extension = ? AND is_active = 1 AND deleted_at IS NULL
         LIMIT 1`,
    excludeEmployeeId ? [extension, excludeEmployeeId] : [extension]
  );
  if (rows.length > 0) {
    throw duplicateError(
      ErrorCodes.EXTENSION_TAKEN,
      'This extension number is already in use by another employee.',
      'extension'
    );
  }
}

async function writeAudit(conn, { actorUserId, action, entityType, entityId, ip, userAgent }) {
  await conn.execute(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorUserId, action, entityType, entityId, ip || null, userAgent || null]
  );
}

/**
 * Server-driven directory list.
 *
 * `q` matches the fields surfaced by the search bar (Arabic/English name,
 * username, email, extension). `roleCode` filters on the effective role:
 * an account with the admin role is "admin", every other employee (including
 * employees without a login account) is "employee". `orgUnitId` matches the
 * selected unit and all of its descendants.
 */
export async function listEmployees({ q = '', roleCode, orgUnitId } = {}) {
  const params = [];
  const conditions = ['e.deleted_at IS NULL'];
  let cte = '';

  if (orgUnitId) {
    cte = `WITH RECURSIVE subtree AS (
      SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT o.id
      FROM org_units o
      JOIN subtree s ON o.parent_id = s.id
      WHERE o.deleted_at IS NULL
    ) `;
    params.push(orgUnitId);
    conditions.push('e.org_unit_id IN (SELECT id FROM subtree)');
  }

  if (q) {
    const like = `%${escapeLike(q)}%`;
    conditions.push(`(
      e.full_name_ar LIKE ? OR
      e.full_name_en LIKE ? OR
      u.username LIKE ? OR
      e.email LIKE ? OR
      e.extension LIKE ?
    )`);
    params.push(like, like, like, like, like);
  }

  if (roleCode === 'admin') {
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.code = 'admin'
    )`);
  } else if (roleCode === 'employee') {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.code = 'admin'
    )`);
  }

  const [rows] = await pool.execute(
    `${cte}SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_JOINS}
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.full_name_ar ASC
     LIMIT 500`,
    params
  );

  return rows.map(mapEmployee);
}

export async function getEmployee(employeeId) {
  const employee = await fetchEmployee(pool, employeeId);
  if (!employee) {
    throw new AppError(404, ErrorCodes.EMPLOYEE_NOT_FOUND, 'Employee not found');
  }
  return employee;
}

/** Role options for the directory filter and the edit form. */
export async function listRoleOptions() {
  const [rows] = await pool.query(
    `SELECT code, name_ar, name_en
     FROM roles
     WHERE code IN ('admin', 'employee')
     ORDER BY FIELD(code, 'admin', 'employee')`
  );
  return rows.map((row) => ({
    code: row.code,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? null,
  }));
}

function validationError(field, message) {
  return new AppError(422, ErrorCodes.VALIDATION_ERROR, 'Invalid request', [
    { field, message },
  ]);
}

/**
 * Updates an employee directory entry and its optional login account.
 *
 * - The username never changes. When the employee has no account, one is
 *   created (which requires a password) with a generated unique username.
 * - Email is unique across all employee rows, excluding the current one.
 * - Extension is unique among active, non-deleted employees, excluding the
 *   current one.
 * - A blank password leaves the existing credential untouched.
 */
export async function updateEmployee(employeeId, input, actor, ctx = {}) {
  return withTransaction(async (conn) => {
    const [employeeRows] = await conn.execute(
      `SELECT e.id, u.id AS user_id, u.username
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id AND u.deleted_at IS NULL
       WHERE e.id = ? AND e.deleted_at IS NULL
       LIMIT 1`,
      [employeeId]
    );

    if (employeeRows.length === 0) {
      throw new AppError(404, ErrorCodes.EMPLOYEE_NOT_FOUND, 'Employee not found');
    }
    const existing = employeeRows[0];

    const [orgRows] = await conn.execute(
      'SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.orgUnitId]
    );
    if (orgRows.length === 0) {
      throw validationError('orgUnitId', 'No such org unit');
    }

    const [roleRows] = await conn.execute(
      'SELECT id, code FROM roles WHERE code = ? LIMIT 1',
      [input.roleCode]
    );
    if (roleRows.length === 0) {
      throw validationError('roleCode', `No role with code "${input.roleCode}"`);
    }
    const role = roleRows[0];

    await assertEmailAvailable(conn, input.email, employeeId);
    await assertExtensionAvailable(conn, input.extension, employeeId);

    if (!existing.user_id && !input.password) {
      throw validationError(
        'password',
        'A password is required to create a login account for this employee.'
      );
    }

    try {
      await conn.execute(
        `UPDATE employees
         SET org_unit_id = ?, full_name_ar = ?, full_name_en = ?,
             job_title_ar = ?, email = ?, extension = ?
         WHERE id = ?`,
        [
          input.orgUnitId,
          input.fullNameAr,
          input.fullNameEn,
          input.jobTitleAr,
          input.email,
          input.extension,
          employeeId,
        ]
      );

      let userId = existing.user_id;

      if (userId) {
        if (input.password) {
          const passwordHash = await hashPassword(input.password);
          await conn.execute(
            `UPDATE users
             SET password_hash = ?, password_algo = 'argon2id',
                 password_changed_at = UTC_TIMESTAMP(3),
                 failed_login_count = 0, locked_until = NULL
             WHERE id = ?`,
            [passwordHash, userId]
          );
        }
      } else {
        const username = await findAvailableUsername(conn, input.fullNameEn);
        const passwordHash = await hashPassword(input.password);
        userId = crypto.randomUUID();

        await conn.execute(
          `INSERT INTO users
             (id, employee_id, username, password_hash, password_algo, password_changed_at, is_active)
           VALUES (?, ?, ?, ?, 'argon2id', UTC_TIMESTAMP(3), 1)`,
          [userId, employeeId, username, passwordHash]
        );

        await conn.execute(
          `INSERT INTO user_settings (user_id, language) VALUES (?, 'ar')
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
          [userId]
        );
      }

      // Keep the binary role model: exactly one role per account. Preserve an
      // existing employee-role scope so an edit does not silently widen it;
      // admins always receive the global scope.
      const [scopeRows] = await conn.execute(
        `SELECT scope_org_unit_id FROM user_roles
         WHERE user_id = ?
         ORDER BY granted_at ASC
         LIMIT 1`,
        [userId]
      );
      const preservedScope =
        role.code === 'admin' ? null : scopeRows[0]?.scope_org_unit_id ?? null;

      await conn.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      await conn.execute(
        `INSERT INTO user_roles (id, user_id, role_id, scope_org_unit_id, granted_by)
         VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), userId, role.id, preservedScope, actor.id]
      );

      await writeAudit(conn, {
        actorUserId: actor.id,
        action: 'employee.update',
        entityType: 'employee',
        entityId: employeeId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } catch (err) {
      // Two admins may race between the pre-checks; map the database-level
      // unique constraints to the same stable field errors.
      if (err && err.code === 'ER_DUP_ENTRY') {
        const message = String(err.message || '');
        if (message.includes('uq_employees_email')) {
          throw duplicateError(
            ErrorCodes.EMAIL_TAKEN,
            'This email address is already registered.',
            'email'
          );
        }
        if (message.includes('uq_employees_active_extension')) {
          throw duplicateError(
            ErrorCodes.EXTENSION_TAKEN,
            'This extension number is already in use by another employee.',
            'extension'
          );
        }
      }
      throw err;
    }

    const updated = await fetchEmployee(conn, employeeId);
    return updated;
  });
}
