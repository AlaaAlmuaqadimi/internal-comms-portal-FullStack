/**
 * Employee directory + Edit Employee test (service layer, no HTTP server).
 *
 *   npm run test:employees --prefix backend
 *
 * Covers:
 *   - real directory listing with server-side search and role/org filters
 *   - update schema messages (same rules as Add Employee)
 *   - update flow: username stays fixed, blank password keeps the hash,
 *     own email/extension are not reported as duplicates, role changes work
 *   - creating a login account for an employee that has none
 *
 * Creates disposable rows and hard-deletes them afterwards.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../src/db/pool.js';
import * as users from '../src/modules/users/user.service.js';
import * as employees from '../src/modules/employees/employee.service.js';
import { createUserSchema } from '../src/modules/users/user.schemas.js';
import { updateEmployeeSchema } from '../src/modules/employees/employee.schemas.js';

const PASSWORD = 'Str0ngPassw0rd';
const NEW_PASSWORD = 'N3wPassw0rd!';
const letters = 'abcdefghijklmnopqrstuvwxyz';
const suffix = Array.from({ length: 8 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');

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

async function nextExtension() {
  const [rows] = await pool.query(
    `SELECT extension FROM employees
     WHERE extension REGEXP '^[0-9]+$' AND is_active = 1 AND deleted_at IS NULL`
  );
  const used = new Set(rows.map((row) => row.extension));
  for (let i = 0; i < 300; i += 1) {
    const candidate = String(800000000 + Math.floor(Math.random() * 99999999));
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Could not allocate a free extension');
}

function updatePayload(overrides = {}) {
  return {
    fullNameAr: 'موظف محدث',
    fullNameEn: `Updated Person ${suffix}`,
    jobTitleAr: 'أخصائي تحديث',
    email: `updated.${suffix}@example.com`,
    extension: '999888777',
    roleCode: 'employee',
    orgUnitId: '00000000-0000-0000-0000-000000000000',
    ...overrides,
  };
}

function firstUpdateMessage(patch) {
  const parsed = updateEmployeeSchema.safeParse(updatePayload(patch));
  return parsed.success ? null : parsed.error.issues[0].message;
}

async function main() {
  const [orgRows] = await pool.query(
    'SELECT id FROM org_units WHERE deleted_at IS NULL ORDER BY sort_order, name_ar'
  );
  const [[admin]] = await pool.query(
    'SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1'
  );
  const [[firstEmployee]] = await pool.query(
    'SELECT id FROM employees WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1'
  );

  assert.ok(orgRows.length > 0, 'an active org unit is required');
  assert.ok(admin, 'an admin user is required');
  assert.ok(firstEmployee, 'at least one employee is required');

  const org = orgRows[0];
  const otherOrg = orgRows.find((row) => row.id !== org.id) || org;
  const actor = { id: admin.id, isGlobal: true, scopes: [] };

  // --- schema messages -----------------------------------------------------
  check('empty Arabic name message', () =>
    assert.equal(firstUpdateMessage({ fullNameAr: '' }), 'Full Name is required.')
  );
  check('short Arabic name message', () =>
    assert.equal(
      firstUpdateMessage({ fullNameAr: 'علي' }),
      'Full Name must be at least 4 characters long.'
    )
  );
  check('Arabic name rejects digits', () =>
    assert.equal(
      firstUpdateMessage({ fullNameAr: 'أحمد 123' }),
      'Full Name should contain letters only (no numbers or special characters).'
    )
  );
  check('English name rejects Arabic', () =>
    assert.equal(
      firstUpdateMessage({ fullNameEn: 'أحمد محمد' }),
      'English Name must contain English letters only.'
    )
  );
  check('empty email message', () =>
    assert.equal(firstUpdateMessage({ email: '' }), 'Email address is required.')
  );
  check('invalid email message', () =>
    assert.equal(firstUpdateMessage({ email: 'bad-email' }), 'Please enter a valid email address.')
  );
  check('short extension message', () =>
    assert.equal(
      firstUpdateMessage({ extension: '12' }),
      'Extension number must be at least 3 numeric digits.'
    )
  );
  check('extension rejects letters', () =>
    assert.equal(
      firstUpdateMessage({ extension: '12a4' }),
      'Extension number must be at least 3 numeric digits.'
    )
  );
  check('invalid role message', () =>
    assert.equal(firstUpdateMessage({ roleCode: 'owner' }), 'Please select a valid role.')
  );
  check('invalid org unit message', () =>
    assert.equal(
      firstUpdateMessage({ orgUnitId: 'not-a-uuid' }),
      'Please select a valid organizational unit.'
    )
  );
  check('missing job title message', () =>
    assert.equal(firstUpdateMessage({ jobTitleAr: '' }), 'Job Title is required.')
  );
  check('short password message', () =>
    assert.equal(
      firstUpdateMessage({ password: 'short' }),
      'Password must be at least 8 characters long.'
    )
  );
  check('blank password is accepted in edit mode', () => {
    const parsed = updateEmployeeSchema.safeParse(updatePayload({ password: '' }));
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.password, undefined);
  });
  check('isActive accepts a boolean', () => {
    const parsed = updateEmployeeSchema.safeParse(updatePayload({ isActive: false }));
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.isActive, false);
  });
  check('isActive rejects a non-boolean', () =>
    assert.equal(
      firstUpdateMessage({ isActive: 'false' }),
      'Account status must be true or false.'
    )
  );

  // --- real directory listing ---------------------------------------------
  const directory = await employees.listEmployees({});
  check('directory returns real employees', () => assert.ok(directory.length >= 1));
  check('directory rows expose org unit and role', () => {
    const row = directory[0];
    assert.ok(row.orgUnitId);
    assert.ok(row.orgUnitNameAr);
    assert.ok(row.roleCode === 'admin' || row.roleCode === 'employee');
  });

  const searched = await employees.listEmployees({ q: 'a' });
  check('search is applied server-side', () => assert.ok(searched.length <= directory.length));

  // --- status filter (active / inactive / online / offline) -----------------
  const activeRows = await employees.listEmployees({ status: 'active' });
  check('active status filter returns only active employees', () =>
    assert.ok(activeRows.length > 0 && activeRows.every((row) => row.isActive))
  );

  const inactiveRows = await employees.listEmployees({ status: 'inactive' });
  check('inactive status filter returns only inactive employees', () =>
    assert.ok(inactiveRows.every((row) => !row.isActive))
  );

  const onlineRows = await employees.listEmployees({ status: 'online' });
  check('online status filter returns active online employees', () =>
    assert.ok(
      onlineRows.every((row) => row.isActive && row.presence === 'online')
    )
  );

  const offlineRows = await employees.listEmployees({ status: 'offline' });
  check('offline status filter excludes online employees', () =>
    assert.ok(
      offlineRows.every((row) => row.isActive && row.presence !== 'online')
    )
  );

  // --- org-unit filter includes descendants --------------------------------
  const [[parentUnit]] = await pool.query(
    `SELECT p.id
     FROM org_units p
     JOIN org_units c ON c.parent_id = p.id
     WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY p.sort_order
     LIMIT 1`
  );

  if (parentUnit) {
    const [subtreeRows] = await pool.execute(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM org_units WHERE id = ?
         UNION ALL
         SELECT o.id FROM org_units o
         JOIN subtree s ON o.parent_id = s.id
         WHERE o.deleted_at IS NULL
       )
       SELECT id FROM subtree`,
      [parentUnit.id]
    );
    const subtreeIds = new Set(subtreeRows.map((row) => row.id));
    const parentFiltered = await employees.listEmployees({ orgUnitId: parentUnit.id });

    check('org-unit filter returns only the selected subtree', () =>
      assert.ok(
        parentFiltered.length > 0 &&
          parentFiltered.every((row) => subtreeIds.has(row.orgUnitId))
      )
    );
    check('org-unit filter includes descendant employees', () =>
      assert.ok(parentFiltered.some((row) => row.orgUnitId !== parentUnit.id))
    );
  }

  // --- update an existing employee ----------------------------------------
  const extensionOne = await nextExtension();
  const extensionTwo = await nextExtension();
  const firstEmail = `directory.${suffix}@example.com`;

  const first = await users.createUser(
    createUserSchema.parse({
      password: PASSWORD,
      fullNameAr: `موظف دليل ${suffix}`.slice(0, 100),
      fullNameEn: `Directory Person ${suffix}`,
      email: firstEmail,
      jobTitleAr: 'أخصائي دليل',
      extension: extensionOne,
      roleCode: 'employee',
      orgUnitId: org.id,
    }),
    actor
  );
  created.push(first.employeeId);

  const second = await users.createUser(
    createUserSchema.parse({
      password: PASSWORD,
      fullNameAr: `موظف ثان ${suffix}`.slice(0, 100),
      fullNameEn: `Second Person ${suffix}`,
      email: `second.${suffix}@example.com`,
      jobTitleAr: 'أخصائي ثان',
      extension: extensionTwo,
      roleCode: 'employee',
      orgUnitId: org.id,
    }),
    actor
  );
  created.push(second.employeeId);

  check('username is generated on create', () => assert.ok(first.username));

  const [[hashBefore]] = await pool.execute(
    'SELECT password_hash FROM users WHERE employee_id = ?',
    [first.employeeId]
  );

  const updatedEmail = `updated.directory.${suffix}@example.com`;
  const updatedExtension = await nextExtension();
  const updated = await employees.updateEmployee(
    first.employeeId,
    updateEmployeeSchema.parse(
      updatePayload({
        fullNameAr: 'موظف دليل محدث',
        fullNameEn: `Updated Directory ${suffix}`,
        jobTitleAr: 'أخصائي محدث',
        email: updatedEmail,
        extension: updatedExtension,
        orgUnitId: otherOrg.id,
        roleCode: 'admin',
        password: '',
      })
    ),
    actor
  );

  check('update returns the refreshed employee', () => assert.ok(updated));
  check('username is never changed by an update', () =>
    assert.equal(updated.username, first.username)
  );
  check('update persists name, email and extension', () => {
    assert.equal(updated.fullNameAr, 'موظف دليل محدث');
    assert.equal(updated.fullNameEn, `Updated Directory ${suffix}`);
    assert.equal(updated.email, updatedEmail);
    assert.equal(updated.extension, updatedExtension);
  });
  check('update persists the org unit', () => assert.equal(updated.orgUnitId, otherOrg.id));
  check('update persists the role', () => assert.equal(updated.roleCode, 'admin'));

  const [[hashAfter]] = await pool.execute(
    'SELECT password_hash FROM users WHERE employee_id = ?',
    [first.employeeId]
  );
  check('blank password keeps the current hash', () =>
    assert.equal(hashAfter.password_hash, hashBefore.password_hash)
  );

  const [[roleRow]] = await pool.execute(
    `SELECT r.code FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [updated.userId]
  );
  check('role assignment is replaced, not duplicated', () => assert.equal(roleRow.code, 'admin'));

  // --- search and filters see the updated row ------------------------------
  const byEmail = await employees.listEmployees({ q: updatedEmail });
  check('search by email finds the updated employee', () => {
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0].id, first.employeeId);
  });

  const byExtension = await employees.listEmployees({ q: updatedExtension });
  check('search by extension finds the updated employee', () =>
    assert.equal(byExtension[0]?.id, first.employeeId)
  );

  const adminFilter = await employees.listEmployees({
    q: updatedEmail,
    roleCode: 'admin',
  });
  check('admin role filter includes the promoted employee', () =>
    assert.equal(adminFilter.length, 1)
  );

  const employeeFilter = await employees.listEmployees({
    q: updatedEmail,
    roleCode: 'employee',
  });
  check('employee role filter excludes the promoted employee', () =>
    assert.equal(employeeFilter.length, 0)
  );

  const orgFilter = await employees.listEmployees({
    q: updatedEmail,
    orgUnitId: otherOrg.id,
  });
  check('org-unit filter includes the updated employee', () => assert.equal(orgFilter.length, 1));

  // --- uniqueness excluding the current employee ---------------------------
  const sameOwnValues = await employees.updateEmployee(
    first.employeeId,
    updateEmployeeSchema.parse(
      updatePayload({
        fullNameAr: 'موظف دليل محدث',
        fullNameEn: `Updated Directory ${suffix}`,
        jobTitleAr: 'أخصائي محدث',
        email: updatedEmail,
        extension: updatedExtension,
        orgUnitId: otherOrg.id,
        roleCode: 'admin',
      })
    ),
    actor
  );
  check('own email and extension are allowed on re-save', () =>
    assert.equal(sameOwnValues.email, updatedEmail)
  );

  await assert.rejects(
    () =>
      employees.updateEmployee(
        first.employeeId,
        updateEmployeeSchema.parse(
          updatePayload({
            email: second.email,
            extension: updatedExtension,
            orgUnitId: otherOrg.id,
          })
        ),
        actor
      ),
    (err) => err.code === 'EMAIL_TAKEN' && err.details?.[0]?.field === 'email'
  );
  check('another employee email is rejected with EMAIL_TAKEN', () => {});

  await assert.rejects(
    () =>
      employees.updateEmployee(
        first.employeeId,
        updateEmployeeSchema.parse(
          updatePayload({
            email: updatedEmail,
            extension: extensionTwo,
            orgUnitId: otherOrg.id,
          })
        ),
        actor
      ),
    (err) => err.code === 'EXTENSION_TAKEN' && err.details?.[0]?.field === 'extension'
  );
  check('another active extension is rejected with EXTENSION_TAKEN', () => {});

  // --- password update path ------------------------------------------------
  await employees.updateEmployee(
    first.employeeId,
    updateEmployeeSchema.parse(
      updatePayload({
        fullNameAr: 'موظف دليل محدث',
        fullNameEn: `Updated Directory ${suffix}`,
        jobTitleAr: 'أخصائي محدث',
        email: updatedEmail,
        extension: updatedExtension,
        orgUnitId: otherOrg.id,
        roleCode: 'admin',
        password: NEW_PASSWORD,
      })
    ),
    actor
  );

  const [[hashChanged]] = await pool.execute(
    'SELECT password_hash FROM users WHERE employee_id = ?',
    [first.employeeId]
  );
  check('a supplied password replaces the stored hash', () =>
    assert.notEqual(hashChanged.password_hash, hashBefore.password_hash)
  );

  // --- employee without a login account -----------------------------------
  const noAccountId = crypto.randomUUID();
  const noAccountExtension = await nextExtension();
  await pool.execute(
    `INSERT INTO employees
       (id, org_unit_id, code, full_name_ar, full_name_en, job_title_ar, email, extension, presence, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', 1)`,
    [
      noAccountId,
      org.id,
      `DIR-${suffix}`,
      'موظف بلا حساب',
      `No Account ${suffix}`,
      'أخصائي',
      `noaccount.${suffix}@example.com`,
      noAccountExtension,
    ]
  );
  created.push(noAccountId);

  const [[noAccount]] = await pool.execute(
    `SELECT u.id FROM users u WHERE u.employee_id = ?`,
    [noAccountId]
  );
  check('fixture employee starts without an account', () => assert.equal(noAccount, undefined));

  await assert.rejects(
    () =>
      employees.updateEmployee(
        noAccountId,
        updateEmployeeSchema.parse(
          updatePayload({
            fullNameAr: 'موظف بلا حساب',
            fullNameEn: `No Account ${suffix}`,
            email: `noaccount.${suffix}@example.com`,
            extension: noAccountExtension,
            orgUnitId: org.id,
          })
        ),
        actor
      ),
    (err) =>
      err.code === 'VALIDATION_ERROR' && err.details?.[0]?.field === 'password'
  );
  check('an account-less employee requires a password on update', () => {});

  const activated = await employees.updateEmployee(
    noAccountId,
    updateEmployeeSchema.parse(
      updatePayload({
        fullNameAr: 'موظف بلا حساب',
        fullNameEn: `No Account ${suffix}`,
        jobTitleAr: 'أخصائي',
        email: `noaccount.${suffix}@example.com`,
        extension: noAccountExtension,
        orgUnitId: org.id,
        roleCode: 'employee',
        password: PASSWORD,
      })
    ),
    actor
  );
  check('updating an account-less employee creates the login account', () => {
    assert.equal(activated.hasAccount, true);
    assert.ok(activated.username);
    assert.equal(activated.roleCode, 'employee');
  });

  // --- availability excludes the current employee --------------------------
  const ownEmailAvailability = await users.checkAvailability({
    field: 'email',
    value: updatedEmail,
    excludeEmployeeId: first.employeeId,
  });
  check('availability excludes the current employee email', () =>
    assert.equal(ownEmailAvailability.available, true)
  );

  const ownExtensionAvailability = await users.checkAvailability({
    field: 'extension',
    value: updatedExtension,
    excludeEmployeeId: first.employeeId,
  });
  check('availability excludes the current employee extension', () =>
    assert.equal(ownExtensionAvailability.available, true)
  );

  const otherEmailAvailability = await users.checkAvailability({
    field: 'email',
    value: updatedEmail,
    excludeEmployeeId: second.employeeId,
  });
  check('availability still reports other employees as taken', () =>
    assert.equal(otherEmailAvailability.available, false)
  );

  // --- account status toggle ----------------------------------------------
  const statusPayload = {
    fullNameAr: 'موظف دليل محدث',
    fullNameEn: `Updated Directory ${suffix}`,
    jobTitleAr: 'أخصائي محدث',
    email: updatedEmail,
    extension: updatedExtension,
    orgUnitId: otherOrg.id,
    roleCode: 'admin',
  };

  const deactivated = await employees.updateEmployee(
    first.employeeId,
    updateEmployeeSchema.parse({ ...statusPayload, isActive: false }),
    actor
  );
  check('deactivating marks the employee inactive and offline', () => {
    assert.equal(deactivated.isActive, false);
    assert.equal(deactivated.presence, 'offline');
  });

  const [[userActive]] = await pool.execute(
    'SELECT is_active FROM users WHERE employee_id = ?',
    [first.employeeId]
  );
  check('deactivation disables the login account', () =>
    assert.equal(Number(userActive.is_active), 0)
  );

  const inactiveSearch = await employees.listEmployees({
    q: updatedEmail,
    status: 'inactive',
  });
  check('inactive filter finds the deactivated employee', () =>
    assert.equal(inactiveSearch[0]?.id, first.employeeId)
  );

  const activeSearch = await employees.listEmployees({
    q: updatedEmail,
    status: 'active',
  });
  check('active filter excludes the deactivated employee', () =>
    assert.equal(activeSearch.length, 0)
  );

  const freedExtension = await users.checkAvailability({
    field: 'extension',
    value: updatedExtension,
  });
  check('deactivation frees the extension number', () =>
    assert.equal(freedExtension.available, true)
  );

  const reactivated = await employees.updateEmployee(
    first.employeeId,
    updateEmployeeSchema.parse({ ...statusPayload, isActive: true }),
    actor
  );
  check('reactivation restores the employee and its account', () => {
    assert.equal(reactivated.isActive, true);
  });

  // --- not found -----------------------------------------------------------
  await assert.rejects(
    () => employees.getEmployee(crypto.randomUUID()),
    (err) => err.code === 'EMPLOYEE_NOT_FOUND'
  );
  check('unknown employee returns EMPLOYEE_NOT_FOUND', () => {});
}

try {
  await main();
} catch (err) {
  console.error('[test:employees] error:', err);
  process.exitCode = 1;
} finally {
  for (const employeeId of created) {
    await pool.execute('DELETE FROM users WHERE employee_id = ?', [employeeId]).catch(() => {});
    await pool.execute('DELETE FROM employees WHERE id = ?', [employeeId]).catch(() => {});
  }
  console.log(`\n[test:employees] ${passed} checks passed`);
  await pool.end();
}
