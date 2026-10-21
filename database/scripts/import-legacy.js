#!/usr/bin/env node
'use strict';

/**
 * Legacy JSON -> MySQL importer.
 *
 * Loads the reference data that lived under FrontEnd/data/ in the legacy app
 * (commit dd2ee3a) and upserts it into the MySQL 8 schema created by the
 * migrations in database/migrations.
 *
 *   org.json       -> org_units, org_unit_kitchens
 *   kitchens.json  -> kitchens
 *   accounts.json  -> employees
 *   users.json     -> users, user_settings, employee_contacts
 *
 * Every statement is parameterized (no string interpolation of values) and the
 * whole run happens in a single transaction, so it is safe to re-run: inserts
 * are idempotent upserts and existing passwords are never overwritten.
 *
 * Usage:
 *   node scripts/import-legacy.js [--data-dir <dir>] [--dry-run]
 *
 * Data source resolution (per file):
 *   1. <data-dir>/<file> when --data-dir / LEGACY_DATA_DIR is set and present
 *   2. otherwise `git show dd2ee3a:FrontEnd/data/<file>`
 *
 * Connection settings come from the repo-root .env (see .env.example).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', 'backend', '.env'),
  override: true,
});

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_REV = 'dd2ee3a';
const LEGACY_DIR = 'FrontEnd/data';
const ROOT_KIND_FALLBACK = 'group';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const dataDirFlagIndex = argv.indexOf('--data-dir');
const dataDir =
  dataDirFlagIndex !== -1
    ? argv[dataDirFlagIndex + 1]
    : process.env.LEGACY_DATA_DIR || null;

function log(...args) {
  console.log('[import]', ...args);
}

function warn(...args) {
  console.warn('[import][warn]', ...args);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadJson(file) {
  if (dataDir) {
    const candidate = path.resolve(dataDir, file);
    if (fs.existsSync(candidate)) {
      return JSON.parse(stripBom(fs.readFileSync(candidate, 'utf8')));
    }
  }
  try {
    const raw = execFileSync(
      'git',
      ['show', `${LEGACY_REV}:${LEGACY_DIR}/${file}`],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    return JSON.parse(stripBom(raw));
  } catch (err) {
    throw new Error(
      `Could not read legacy ${file}. Provide --data-dir pointing at the ` +
        `FrontEnd/data folder, or make sure git history (${LEGACY_REV}) is available.\n` +
        `  ${err.message}`
    );
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function toMysqlDatetime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

function metadataFor(record) {
  return record.avatarAlt ? JSON.stringify({ avatarAlt: record.avatarAlt }) : null;
}

function presenceFor(record) {
  return record.status === 'online' ? 'online' : 'offline';
}

// ---------------------------------------------------------------------------
// Import steps
// ---------------------------------------------------------------------------

function flattenOrg(org) {
  const out = [];
  (function walk(node, parentCode, order) {
    out.push({ node, parentCode, order });
    (node.children || []).forEach((child, i) => walk(child, node.id, i));
  })(org, null, 0);
  return out;
}

async function importOrgUnits(conn, org) {
  const rows = flattenOrg(org);
  for (const { node, parentCode, order } of rows) {
    const nameAr = node.name || '(unnamed)';
    const kind = node.kind || ROOT_KIND_FALLBACK;
    if (parentCode === null) {
      await conn.execute(
        `INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
         VALUES (NULL, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           parent_id = VALUES(parent_id), name_ar = VALUES(name_ar),
           kind = VALUES(kind), sort_order = VALUES(sort_order)`,
        [node.id, nameAr, kind, order]
      );
    } else {
      await conn.execute(
        `INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
         SELECT p.id, ?, ?, ?, ? FROM org_units p WHERE p.code = ?
         ON DUPLICATE KEY UPDATE
           parent_id = VALUES(parent_id), name_ar = VALUES(name_ar),
           kind = VALUES(kind), sort_order = VALUES(sort_order)`,
        [node.id, nameAr, kind, order, parentCode]
      );
    }
  }
  return rows.length;
}

async function importKitchens(conn, kitchens) {
  for (const k of kitchens) {
    await conn.execute(
      `INSERT INTO kitchens (code, name_ar, scope_ar)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar), scope_ar = VALUES(scope_ar)`,
      [k.id, k.name, k.scope || null]
    );
  }
  return kitchens.length;
}

async function importOrgUnitKitchens(conn, org) {
  const [unitRows] = await conn.query('SELECT id, code FROM org_units');
  const unitByCode = new Map(unitRows.map((r) => [r.code, r.id]));
  const [kitchenRows] = await conn.query('SELECT id, name_ar FROM kitchens');
  const kitchenByName = new Map(kitchenRows.map((r) => [r.name_ar, r.id]));

  let linked = 0;
  const missing = new Set();

  const nodes = flattenOrg(org);
  for (const { node } of nodes) {
    if (!node.kitchen) continue;
    const unitId = unitByCode.get(node.id);
    if (!unitId) continue;
    const names = String(node.kitchen)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of names) {
      const kitchenId = kitchenByName.get(name);
      if (!kitchenId) {
        missing.add(name);
        continue;
      }
      const [res] = await conn.execute(
        'INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id) VALUES (?, ?)',
        [unitId, kitchenId]
      );
      linked += res.affectedRows;
    }
  }
  return { linked, missing: [...missing] };
}

async function importEmployees(conn, accounts) {
  const [unitRows] = await conn.query('SELECT id, code FROM org_units');
  const unitByCode = new Map(unitRows.map((r) => [r.code, r.id]));

  let inserted = 0;
  const missingUnits = new Set();

  for (const a of accounts) {
    const orgUnitId = unitByCode.get(a.unitId);
    if (!orgUnitId) {
      missingUnits.add(a.unitId);
      continue;
    }
    await conn.execute(
      `INSERT INTO employees
         (org_unit_id, code, full_name_ar, presence, avatar_url, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         org_unit_id = VALUES(org_unit_id), full_name_ar = VALUES(full_name_ar),
         presence = VALUES(presence), avatar_url = VALUES(avatar_url),
         metadata = VALUES(metadata)`,
      [
        orgUnitId,
        String(a.id),
        a.name,
        presenceFor(a),
        a.avatar || null,
        metadataFor(a),
      ]
    );
    inserted += 1;
  }
  return { inserted, missingUnits: [...missingUnits] };
}

function legacyPassword(user) {
  if (!user.passwordSalt || !user.passwordHash) {
    warn(`user "${user.username}" has no legacy password; forcing reset.`);
    return { hash: null, algo: 'scrypt-legacy' };
  }
  return { hash: `scrypt$${user.passwordSalt}$${user.passwordHash}`, algo: 'scrypt-legacy' };
}

async function importUsers(conn, users) {
  const summary = {
    users: 0,
    settings: 0,
    contacts: 0,
    createdEmployees: 0,
    strategies: [],
  };

  const [unitRows] = await conn.query('SELECT id, code FROM org_units');
  const unitByCode = new Map(unitRows.map((r) => [r.code, r.id]));
  const [kitchenRows] = await conn.query('SELECT id, code FROM kitchens');
  const kitchenByCode = new Map(kitchenRows.map((r) => [r.code, r.id]));
  const [empRows] = await conn.query(
    'SELECT id, code, full_name_ar, org_unit_id FROM employees'
  );
  const empByCode = new Map(empRows.map((r) => [r.code, r]));
  const empByNameUnit = new Map(
    empRows.map((r) => [`${r.full_name_ar}::${r.org_unit_id}`, r.id])
  );

  async function employeeIdForUser(user) {
    const byCode = empByCode.get(String(user.id));
    if (byCode) return { id: byCode.id, strategy: 'code' };

    const unitId = unitByCode.get(user.unitId) || null;
    const byName = unitId ? empByNameUnit.get(`${user.name}::${unitId}`) : null;
    if (byName) return { id: byName, strategy: 'name+unit' };

    if (!unitId) return { id: null, strategy: 'unresolved' };

    await conn.execute(
      `INSERT INTO employees
         (org_unit_id, code, full_name_ar, presence, avatar_url, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         org_unit_id = VALUES(org_unit_id), full_name_ar = VALUES(full_name_ar)`,
      [
        unitId,
        String(user.id),
        user.name,
        presenceFor(user),
        user.avatar || null,
        metadataFor(user),
      ]
    );
    const [rows] = await conn.execute('SELECT id FROM employees WHERE code = ?', [
      String(user.id),
    ]);
    summary.createdEmployees += 1;
    return { id: rows[0].id, strategy: 'created' };
  }

  for (const u of users) {
    const { id: employeeId, strategy } = await employeeIdForUser(u);
    summary.strategies.push(`${u.username}:${strategy}`);
    if (!employeeId) {
      warn(`could not resolve an employee for user "${u.username}"; skipping.`);
      continue;
    }

    const { hash, algo } = legacyPassword(u);
    await conn.execute(
      `INSERT INTO users
         (employee_id, username, password_hash, password_algo, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employee_id = VALUES(employee_id), username = VALUES(username),
         password_algo = VALUES(password_algo)`,
      [employeeId, u.username, hash, algo, toMysqlDatetime(u.createdAt)]
    );
    summary.users += 1;

    const [userRows] = await conn.execute(
      'SELECT id FROM users WHERE username = ?',
      [u.username]
    );
    const userId = userRows[0].id;

    const kitchenId = kitchenByCode.get(u.kitchenChoice) || null;
    await conn.execute(
      `INSERT INTO user_settings (user_id, language, kitchen_choice_id)
       VALUES (?, 'ar', ?)
       ON DUPLICATE KEY UPDATE kitchen_choice_id = VALUES(kitchen_choice_id)`,
      [userId, kitchenId]
    );
    summary.settings += 1;

    for (const contactCode of u.allowedContacts || []) {
      const contact = empByCode.get(String(contactCode));
      if (!contact || contact.id === employeeId) continue;
      const [res] = await conn.execute(
        'INSERT IGNORE INTO employee_contacts (owner_employee_id, contact_employee_id) VALUES (?, ?)',
        [employeeId, contact.id]
      );
      summary.contacts += res.affectedRows;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const org = loadJson('org.json');
  const kitchens = loadJson('kitchens.json');
  const accounts = loadJson('accounts.json');
  const users = loadJson('users.json');

  log(
    `loaded legacy data: ${flattenOrg(org).length} org units, ` +
      `${kitchens.length} kitchens, ${accounts.length} accounts, ${users.length} users` +
      (dataDir ? ` (from ${path.resolve(dataDir)})` : ` (from git ${LEGACY_REV})`)
  );

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'app_rw',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'internal_comms',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: false,
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const orgCount = await importOrgUnits(conn, org);
    const kitchenCount = await importKitchens(conn, kitchens);
    const { linked, missing } = await importOrgUnitKitchens(conn, org);
    if (missing.length) warn(`unknown kitchen name(s) in org.json: ${missing.join(', ')}`);

    const emp = await importEmployees(conn, accounts);
    if (emp.missingUnits.length) {
      warn(`accounts referencing unknown org units: ${emp.missingUnits.join(', ')}`);
    }

    const usr = await importUsers(conn, users);
    if (usr.strategies.length) log(`user link strategies -> ${usr.strategies.join(', ')}`);

    if (dryRun) {
      await conn.rollback();
      log('DRY RUN - transaction rolled back, nothing was written.');
    } else {
      await conn.commit();
    }

    log('---------------------------------------------');
    log(`org_units ............ ${orgCount}`);
    log(`kitchens ............. ${kitchenCount}`);
    log(`org_unit_kitchens .... ${linked}`);
    log(`employees ............ ${emp.inserted}`);
    log(`  created from users . ${usr.createdEmployees}`);
    log(`users ................ ${usr.users}`);
    log(`user_settings ........ ${usr.settings}`);
    log(`employee_contacts .... ${usr.contacts}`);
    log('---------------------------------------------');
    log(dryRun ? 'Dry run complete.' : 'Import complete.');
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      throw new Error(
        `Schema not found. Apply database/migrations first ` +
          `(docker compose up -d) then re-run.\n  ${err.message}`
      );
    }
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[import][error]', err.message);
  process.exitCode = 1;
});
