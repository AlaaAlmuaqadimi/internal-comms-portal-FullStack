/**
 * Employee form test (database service layer, no HTTP server needed).
 *
 *   npm run test:users --prefix backend
 *
 * Covers the rules the Add Employee form relies on:
 *   - zod messages for every required field
 *   - server-side username generation (`first.last`, numeric suffix on clash)
 *   - unique email / active extension checks
 *   - availability and username-preview helpers
 *
 * Creates disposable rows and hard-deletes them afterwards. Requires the
 * migrations (including V016) to have been applied.
 */
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import * as users from '../src/modules/users/user.service.js';
import { createUserSchema } from '../src/modules/users/user.schemas.js';

const PASSWORD = 'Str0ngPassw0rd';
const letters = 'abcdefghijklmnopqrstuvwxyz';
const suffix = Array.from({ length: 7 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');

const created = [];
let passed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('check() expects a synchronous assertion');
    }
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

function firstMessage(patch) {
  const payload = {
    password: PASSWORD,
    fullNameAr: 'موظف تجريبي',
    fullNameEn: `Testuser ${suffix}`,
    email: `probe.${suffix}@example.com`,
    jobTitleAr: 'أخصائي',
    extension: '321',
    roleCode: 'employee',
    orgUnitId: '00000000-0000-0000-0000-000000000000',
    ...patch,
  };
  const parsed = createUserSchema.safeParse(payload);
  return parsed.success ? null : parsed.error.issues[0].message;
}

async function nextExtension() {
  const [rows] = await pool.query(
    `SELECT extension FROM employees
     WHERE extension REGEXP '^[0-9]+$' AND is_active = 1 AND deleted_at IS NULL`
  );
  const used = new Set(rows.map((r) => r.extension));
  for (let i = 0; i < 200; i += 1) {
    const candidate = String(900000000 + Math.floor(Math.random() * 99999999));
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Could not allocate a free extension');
}

async function main() {
  const [[org]] = await pool.query(
    'SELECT id FROM org_units WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1'
  );
  const [[admin]] = await pool.query(
    'SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1'
  );
  assert.ok(org, 'an active org unit is required');
  assert.ok(admin, 'an admin user is required');

  const actor = { id: admin.id, isGlobal: true, scopes: [] };

  // --- schema messages -----------------------------------------------------
  check('empty Arabic name message', () =>
    assert.equal(firstMessage({ fullNameAr: '' }), 'Full Name is required.')
  );
  check('short Arabic name message', () =>
    assert.equal(
      firstMessage({ fullNameAr: 'علي' }),
      'Full Name must be at least 4 characters long.'
    )
  );
  check('Arabic name rejects digits', () =>
    assert.equal(
      firstMessage({ fullNameAr: 'أحمد 123' }),
      'Full Name should contain letters only (no numbers or special characters).'
    )
  );
  check('English name rejects Arabic', () =>
    assert.equal(
      firstMessage({ fullNameEn: 'أحمد محمد' }),
      'English Name must contain English letters only.'
    )
  );
  check('empty email message', () =>
    assert.equal(firstMessage({ email: '' }), 'Email address is required.')
  );
  check('invalid email message', () =>
    assert.equal(firstMessage({ email: 'not-an-email' }), 'Please enter a valid email address.')
  );
  check('short extension message', () =>
    assert.equal(
      firstMessage({ extension: '12' }),
      'Extension number must be at least 3 numeric digits.'
    )
  );
  check('extension rejects letters', () =>
    assert.equal(
      firstMessage({ extension: '12a4' }),
      'Extension number must be at least 3 numeric digits.'
    )
  );
  check('invalid role message', () =>
    assert.equal(firstMessage({ roleCode: 'owner' }), 'Please select a valid role.')
  );
  check('short password message', () =>
    assert.equal(
      firstMessage({ password: 'short' }),
      'Password must be at least 8 characters long.'
    )
  );
  check('missing job title message', () =>
    assert.equal(firstMessage({ jobTitleAr: '' }), 'Job Title is required.')
  );

  // --- username generation -------------------------------------------------
  const baseName = `Testuser ${suffix}`;
  const preview = await users.previewUsername(baseName);
  check('preview returns first.last pattern', () =>
    assert.equal(preview.username, `testuser.${suffix}`)
  );

  const buildPayload = (overrides = {}) =>
    createUserSchema.parse({
      password: PASSWORD,
      fullNameAr: `موظف تجريبي ${suffix}`,
      fullNameEn: baseName,
      email: `employee.${suffix}@example.com`,
      jobTitleAr: 'أخصائي موارد بشرية',
      extension: overrides.extension || undefined,
      roleCode: 'employee',
      orgUnitId: org.id,
      ...overrides,
    });

  const firstExtension = await nextExtension();
  const firstPayload = buildPayload({ extension: firstExtension });
  const first = await users.createUser(firstPayload, actor);
  created.push({ userId: first.id, employeeId: first.employeeId });
  check('server generates the previewed username', () =>
    assert.equal(first.username, preview.username)
  );

  const [[firstRow]] = await pool.execute(
    `SELECT e.email, e.extension, e.job_title_ar, u.username
     FROM employees e JOIN users u ON u.employee_id = e.id
     WHERE e.id = ?`,
    [first.employeeId]
  );
  check('employee row stores email, extension and job title', () => {
    assert.equal(firstRow.email, firstPayload.email);
    assert.equal(firstRow.extension, firstExtension);
    assert.equal(firstRow.job_title_ar, 'أخصائي موارد بشرية');
  });
  check('users username is the generated value', () =>
    assert.equal(firstRow.username, preview.username)
  );

  // --- collision handling --------------------------------------------------
  const secondExtension = await nextExtension();
  const second = await users.createUser(
    buildPayload({
      email: `employee2.${suffix}@example.com`,
      extension: secondExtension,
    }),
    actor
  );
  created.push({ userId: second.id, employeeId: second.employeeId });
  check('username collision appends a numeric suffix', () =>
    assert.equal(second.username, `${preview.username}1`)
  );

  // A stale client preview (the explicit value is already taken) must not fail
  // the submission: the server suffixes it instead.
  const third = await users.createUser(
    buildPayload({
      email: `employee3.${suffix}@example.com`,
      extension: await nextExtension(),
      username: preview.username,
    }),
    actor
  );
  created.push({ userId: third.id, employeeId: third.employeeId });
  check('stale explicit username is suffixed server-side', () =>
    assert.equal(third.username, `${preview.username}2`)
  );

  // --- duplicate email -----------------------------------------------------
  const emailCheck = await users.checkAvailability({
    field: 'email',
    value: firstPayload.email.toUpperCase(),
  });
  check('email availability is case-insensitive', () => assert.equal(emailCheck.available, false));

  await assert.rejects(
    async () =>
      users.createUser(
        buildPayload({
          email: firstPayload.email,
          extension: await nextExtension(),
        }),
        actor
      ),
    (err) => err.code === 'EMAIL_TAKEN'
  );
  check('duplicate email is rejected with EMAIL_TAKEN', () => {});

  // --- duplicate extension -------------------------------------------------
  const extensionCheck = await users.checkAvailability({
    field: 'extension',
    value: firstExtension,
  });
  check('extension availability reports taken', () =>
    assert.equal(extensionCheck.available, false)
  );

  await assert.rejects(
    () =>
      users.createUser(
        buildPayload({
          email: `dupe.${suffix}@example.com`,
          extension: firstExtension,
        }),
        actor
      ),
    (err) => err.code === 'EXTENSION_TAKEN'
  );
  check('duplicate active extension is rejected with EXTENSION_TAKEN', () => {});

  // --- free values ---------------------------------------------------------
  const freeExtension = await nextExtension();
  const free = await users.checkAvailability({ field: 'extension', value: freeExtension });
  check('free extension is reported available', () => assert.equal(free.available, true));

  const freeEmail = await users.checkAvailability({
    field: 'email',
    value: `free.${suffix}@example.com`,
  });
  check('free email is reported available', () => assert.equal(freeEmail.available, true));
}

try {
  await main();
} catch (err) {
  console.error('[test:users] error:', err);
  process.exitCode = 1;
} finally {
  for (const row of created) {
    await pool.execute('DELETE FROM users WHERE id = ?', [row.userId]).catch(() => {});
    await pool.execute('DELETE FROM employees WHERE id = ?', [row.employeeId]).catch(() => {});
  }
  console.log(`\n[test:users] ${passed} checks passed`);
  await pool.end();
}
