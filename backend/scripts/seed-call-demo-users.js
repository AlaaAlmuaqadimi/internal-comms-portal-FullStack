/**
 * DEV-ONLY demo accounts for trying the Phase A calls API by hand.
 *
 *   npm run seed:calls --prefix backend
 *   DEV_SEED_PASSWORD=MyDevPass123 npm run seed:calls --prefix backend
 *   node backend/scripts/seed-call-demo-users.js --dev-password MyDevPass123
 *
 * Creates (or resets) five local accounts:
 *
 *   dev.director    employee in the `root` org unit  -> leadership
 *   dev.deputy      employee in the `deputy` org unit -> leadership
 *   dev.employee1   ordinary employee (different unit from #4)
 *   dev.employee2   ordinary employee
 *   dev.admin       admin account, only for PATCH /api/settings/app
 *
 * The Director and Deputy are "leadership" purely because their org unit kind
 * is root/deputy, exactly like the business rule. No role, permission or
 * business logic is changed by this script.
 *
 * NOT part of the migration chain: database/scripts/run-migrations.mjs only
 * reads database/migrations/V*.sql and never executes this file.
 *
 * Passwords: nothing is committed. The password comes from --dev-password or
 * DEV_SEED_PASSWORD; otherwise a random one is generated for the run and
 * printed once. Re-running without a password resets the demo passwords.
 *
 * `--password` is avoided on purpose: npm consumes it as an npm config flag,
 * so `npm run ... -- --password x` would not reach this script. Some npm
 * versions also strip unknown `--flags`; the env var is the reliable path:
 *
 *   PowerShell : $env:DEV_SEED_PASSWORD="MyDevPass123"; npm run seed:calls --prefix backend
 *   bash       : DEV_SEED_PASSWORD=MyDevPass123 npm run seed:calls --prefix backend
 */
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

if (env.nodeEnv === 'production') {
  console.error(
    '[seed:calls] Refusing to run: NODE_ENV=production. This script is dev-only.'
  );
  process.exit(1);
}

const suppliedPassword =
  arg('dev-password') || arg('password') || process.env.DEV_SEED_PASSWORD || null;
const generatedPassword = !suppliedPassword;
const password = suppliedPassword || crypto.randomBytes(12).toString('base64url');

if (password.length < 8 || password.length > 72) {
  console.error('[seed:calls] Password must be 8-72 characters.');
  process.exit(1);
}

const ACCOUNTS = [
  {
    label: 'Director',
    username: 'dev.director',
    employeeCode: 'CALL-DIR',
    fullNameAr: 'مدير المصلحة (تجريبي)',
    fullNameEn: 'Director (demo)',
    jobTitleAr: 'رئيس المصلحة',
    unit: { kind: 'root' },
  },
  {
    label: 'Deputy',
    username: 'dev.deputy',
    employeeCode: 'CALL-DEP',
    fullNameAr: 'وكيل المصلحة (تجريبي)',
    fullNameEn: 'Deputy (demo)',
    jobTitleAr: 'نائب رئيس المصلحة',
    unit: { kind: 'deputy' },
  },
  {
    label: 'Employee 1',
    username: 'dev.employee1',
    employeeCode: 'CALL-EMP1',
    fullNameAr: 'موظف تجريبي أول',
    fullNameEn: 'Demo Employee One',
    jobTitleAr: 'موظف',
    unit: { code: 'u53', fallbackKinds: ['section', 'directorate'] },
  },
  {
    label: 'Employee 2',
    username: 'dev.employee2',
    employeeCode: 'CALL-EMP2',
    fullNameAr: 'موظف تجريبي ثانٍ',
    fullNameEn: 'Demo Employee Two',
    jobTitleAr: 'موظف',
    unit: { code: 'u24', fallbackKinds: ['directorate', 'section'] },
  },
  {
    label: 'Admin',
    username: 'dev.admin',
    employeeCode: 'CALL-ADM',
    fullNameAr: 'مسؤول نظام (تجريبي)',
    fullNameEn: 'System Admin (demo)',
    jobTitleAr: 'مسؤول النظام',
    roleCode: 'admin',
    unit: { code: 'u1', fallbackKinds: ['office'] },
  },
];

const conn = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  charset: 'utf8mb4',
  timezone: 'Z',
});

async function resolveUnit(spec, usedUnitIds) {
  if (spec.code) {
    const [[row]] = await conn.execute(
      `SELECT id, code, name_ar, kind
         FROM org_units
        WHERE code = ? AND deleted_at IS NULL
        LIMIT 1`,
      [spec.code]
    );
    if (row) return row;
  }

  if (spec.kind) {
    const [[row]] = await conn.execute(
      `SELECT id, code, name_ar, kind
         FROM org_units
        WHERE kind = ? AND deleted_at IS NULL AND is_active = 1
        ORDER BY sort_order, code
        LIMIT 1`,
      [spec.kind]
    );
    if (row) return row;
  }

  for (const kind of spec.fallbackKinds || []) {
    const exclude =
      usedUnitIds.length > 0
        ? `AND id NOT IN (${usedUnitIds.map(() => '?').join(', ')})`
        : '';
    const [[row]] = await conn.execute(
      `SELECT id, code, name_ar, kind
         FROM org_units
        WHERE kind = ? AND deleted_at IS NULL AND is_active = 1 ${exclude}
        ORDER BY sort_order, code
        LIMIT 1`,
      [kind, ...usedUnitIds]
    );
    if (row) return row;
  }

  return null;
}

try {
  const roleCache = new Map();
  async function roleId(code) {
    if (!roleCache.has(code)) {
      const [[row]] = await conn.execute(
        `SELECT id FROM roles WHERE code = ? LIMIT 1`,
        [code]
      );
      if (!row) {
        throw new Error(
          `Role "${code}" not found. Run \`npm run migrate --prefix backend\` first.`
        );
      }
      roleCache.set(code, row.id);
    }
    return roleCache.get(code);
  }

  const usedUnitIds = [];
  const rows = [];

  for (const account of ACCOUNTS) {
    const unit = await resolveUnit(account.unit, usedUnitIds);
    if (!unit) {
      throw new Error(
        `No org unit found for ${account.label}. Run \`npm run migrate --prefix backend\` first.`
      );
    }
    usedUnitIds.push(unit.id);

    await conn.execute(
      `INSERT INTO employees
         (org_unit_id, code, full_name_ar, full_name_en, job_title_ar, presence, is_active)
       VALUES (?, ?, ?, ?, ?, 'offline', 1)
       ON DUPLICATE KEY UPDATE
         org_unit_id = VALUES(org_unit_id),
         full_name_ar = VALUES(full_name_ar),
         full_name_en = VALUES(full_name_en),
         job_title_ar = VALUES(job_title_ar),
         presence = 'offline',
         is_active = 1,
         deleted_at = NULL`,
      [
        unit.id,
        account.employeeCode,
        account.fullNameAr,
        account.fullNameEn,
        account.jobTitleAr,
      ]
    );

    const [[employee]] = await conn.execute(
      `SELECT id FROM employees WHERE code = ? LIMIT 1`,
      [account.employeeCode]
    );

    const passwordHash = await hashPassword(password);

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
      [employee.id, account.username, passwordHash]
    );

    const [[user]] = await conn.execute(
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [account.username]
    );

    await conn.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id, scope_org_unit_id)
       VALUES (?, ?, NULL)`,
      [user.id, await roleId(account.roleCode || 'employee')]
    );

    await conn.execute(
      `INSERT INTO user_settings (user_id, language, theme)
       VALUES (?, 'ar', 'system')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [user.id]
    );

    rows.push({
      account: account.label,
      username: account.username,
      role: account.roleCode || 'employee',
      employeeCode: account.employeeCode,
      unit: `${unit.code} (${unit.kind})`,
      employeeId: employee.id,
      leadership: unit.kind === 'root' || unit.kind === 'deputy',
    });
  }

  console.log('\n[seed:calls] demo accounts ready (dev only)\n');
  console.table(rows);
  console.log('Password for all demo accounts:', password);
  if (generatedPassword) {
    console.log(
      '(randomly generated for this run; the script prints it only once)\n' +
        'Set DEV_SEED_PASSWORD, or run node scripts/seed-call-demo-users.js --dev-password <value>,\n' +
        'to choose your own. `npm run ... -- --dev-password` is unreliable: some npm versions strip it.\n'
    );
  } else {
    console.log('(taken from --dev-password / DEV_SEED_PASSWORD)\n');
  }
  console.log('Login endpoint: POST http://localhost:4000/api/auth/login');
  console.log('Example body : {"username":"dev.employee1","password":"<password>"}');
  console.log('\nNext: import backend/docs/calls.postman_collection.json');
  console.log('      and backend/docs/calls.postman_environment.json, then read');
  console.log('      backend/docs/calls-manual-test.md.\n');
} catch (err) {
  console.error('[seed:calls] failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
