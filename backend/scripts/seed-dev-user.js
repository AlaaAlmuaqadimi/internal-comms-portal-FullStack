/**
 * Seeds (or resets) a local development login account.
 *
 *   node scripts/seed-dev-user.js --username admin --password password123 --role admin
 *
 * Idempotent: re-running updates the password and re-applies the role instead
 * of failing. Creates the employee directory entry when missing. Intended for
 * LOCAL DEV ONLY - never run this against a production database.
 */
import mysql from 'mysql2/promise';
import argon2 from 'argon2';
import { env, assertAuthKeysConfigured } from '../src/config/env.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const username = arg('username', 'admin');
const password = arg('password', 'password123');
const roleCode = arg('role', 'admin');
const fullNameAr = arg('name', 'مدير النظام');
const employeeCode = arg('code', username);

assertAuthKeysConfigured();

const conn = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  charset: 'utf8mb4',
  timezone: 'Z',
});

try {
  const [[root]] = await conn.execute(
    `SELECT id FROM org_units WHERE kind = 'root' AND deleted_at IS NULL LIMIT 1`
  );
  if (!root) {
    throw new Error('No root org_unit found. Run database/scripts/run-migrations.mjs first.');
  }

  const [[role]] = await conn.execute(`SELECT id FROM roles WHERE code = ? LIMIT 1`, [roleCode]);
  if (!role) {
    throw new Error(`Role "${roleCode}" not found. Check migrations/V007__seed_roles_and_permissions.sql`);
  }

  await conn.execute(
    `INSERT INTO employees (org_unit_id, code, full_name_ar, presence, is_active)
     VALUES (?, ?, ?, 'online', 1)
     ON DUPLICATE KEY UPDATE org_unit_id = VALUES(org_unit_id), full_name_ar = VALUES(full_name_ar)`,
    [root.id, employeeCode, fullNameAr]
  );
  const [[employee]] = await conn.execute(`SELECT id FROM employees WHERE code = ? LIMIT 1`, [
    employeeCode,
  ]);

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: env.argon2.memoryCost,
    timeCost: env.argon2.timeCost,
    parallelism: env.argon2.parallelism,
  });

  await conn.execute(
    `INSERT INTO users
       (employee_id, username, password_hash, password_algo, password_changed_at,
        failed_login_count, locked_until, is_active)
     VALUES (?, ?, ?, 'argon2id', UTC_TIMESTAMP(3), 0, NULL, 1)
     ON DUPLICATE KEY UPDATE
       employee_id = VALUES(employee_id),
       password_hash = VALUES(password_hash),
       password_algo = 'argon2id',
       password_changed_at = UTC_TIMESTAMP(3),
       failed_login_count = 0,
       locked_until = NULL,
       deleted_at = NULL,
       is_active = 1`,
    [employee.id, username, passwordHash]
  );
  const [[user]] = await conn.execute(`SELECT id FROM users WHERE username = ? LIMIT 1`, [username]);

  await conn.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, scope_org_unit_id)
     VALUES (?, ?, NULL)`,
    [user.id, role.id]
  );

  await conn.execute(
    `INSERT INTO user_settings (user_id, language, theme) VALUES (?, 'ar', 'system')
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [user.id]
  );

  console.log('[seed] dev account ready');
  console.log('       username :', username);
  console.log('       password :', password);
  console.log('       role     :', roleCode);
  console.log('       user id  :', user.id);
  console.log('       login    : POST /api/auth/login');
} finally {
  await conn.end();
}
