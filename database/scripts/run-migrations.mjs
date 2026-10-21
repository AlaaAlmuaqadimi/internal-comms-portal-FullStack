/**
 * Applies database/migrations/V*.sql in order without Flyway or Docker.
 *
 * Requires MySQL 8.0.16+ or MariaDB 10.4+ (the schema relies on generated
 * columns, expression defaults, CHECK constraints and WITH RECURSIVE).
 * utf8mb4_unicode_ci is used instead of the MySQL 8 default utf8mb4_0900_ai_ci
 * so the same migrations also apply to MariaDB.
 *
 * Usage:
 *   node database/scripts/run-migrations.mjs [--dry-run] [--list]
 *
 * Reads DB_* from the repo-root .env then backend/.env (same precedence as the
 * API server). Creates the schema if it does not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function loadMysql() {
  const candidates = [
    path.join(repoRoot, 'database', 'node_modules'),
    path.join(repoRoot, 'backend', 'node_modules'),
    path.join(repoRoot, 'node_modules'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      const require = createRequire(pathToFileURL(path.join(dir, 'noop.js')));
      return require('mysql2/promise');
    }
  }
  throw new Error('mysql2 not found. Run `npm install` in backend/ first.');
}

const mysql = loadMysql();

function loadEnv() {
  const dotenv = createRequire(
    pathToFileURL(path.join(repoRoot, 'backend', 'node_modules', 'noop.js'))
  )('dotenv');
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(repoRoot, 'backend', '.env'), override: true });
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const listOnly = argv.includes('--list');

const migrationsDir = path.join(repoRoot, 'database', 'migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => /^V\d+__.*\.sql$/i.test(f))
  .sort((a, b) => {
    const na = parseInt(a.match(/^V(\d+)__/i)[1], 10);
    const nb = parseInt(b.match(/^V(\d+)__/i)[1], 10);
    return na - nb;
  });

if (listOnly) {
  console.log(files.join('\n'));
  process.exit(0);
}

loadEnv();

const db = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

const schema = process.env.DB_NAME || 'internal_comms';

async function main() {
  console.log(`[migrate] server=${db.host}:${db.port} user=${db.user} schema=${schema}`);

  const server = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    multipleStatements: true,
    connectTimeout: 10000,
  });

  const [[info]] = await server.query('SELECT VERSION() AS v, @@version_comment AS c');
  const version = info.v || '';
  const comment = info.c || '';
  console.log(`[migrate] connected, VERSION() = ${version} (${comment})`);

    if (/mariadb/i.test(version) || /mariadb/i.test(comment)) {
      const mm = version.match(/^(\d+)\.(\d+)/);
      const [maj, min] = mm ? mm.slice(1).map(Number) : [0, 0];
      if (maj < 10 || (maj === 10 && min < 2)) {
        throw new Error(`MariaDB 10.2 or newer is required, connected server is ${version}.`);
      }
      console.log(`[migrate] note: running on MariaDB ${maj}.${min}; production targets MySQL 8.0.`);
    } else {
      const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!m) {
        throw new Error(`Unrecognised server version: ${version}`);
      }
      const [maj, min, pat] = m.slice(1).map(Number);
      if (!(maj > 8 || (maj === 8 && (min > 0 || pat >= 16)))) {
        throw new Error(`MySQL 8.0.16 or newer is required, connected server is ${version}.`);
      }
    }

    await server.query(
      `CREATE DATABASE IF NOT EXISTS \`${schema}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

  await server.changeUser({ database: schema });

  const applied = [];
  const failed = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    if (dryRun) {
      console.log(`[migrate] would apply ${file} (${sql.length} bytes)`);
      continue;
    }
    const started = Date.now();
    try {
      await server.query(sql);
      applied.push(file);
      console.log(`[migrate] OK   ${file} (${Date.now() - started}ms)`);
    } catch (err) {
      failed.push({ file, err });
      console.log(`[migrate] FAIL ${file}`);
      console.log(`          ${err.code || ''} ${err.message}`);
    }
  }

  if (dryRun) {
    console.log('[migrate] dry run, nothing applied.');
  } else if (failed.length === 0) {
    const [[t]] = await server.query(
      'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ?',
      [schema]
    );
    console.log(`[migrate] done. ${applied.length} migration(s) applied, ${t.c} table(s) present.`);
  } else {
    console.log(`[migrate] ${applied.length} applied, ${failed.length} failed.`);
  }

  await server.end();
}

main().catch((err) => {
  console.error('[migrate] error:', err.message);
  process.exit(1);
});
