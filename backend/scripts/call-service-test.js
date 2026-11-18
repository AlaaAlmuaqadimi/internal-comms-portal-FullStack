/**
 * Database-backed call service test.
 *
 *   npm run test:calls:db --prefix backend
 *
 * Requires a migrated MySQL/MariaDB instance (same DB_* variables as the API).
 * Creates disposable employees/calls/notifications/audit rows and removes them
 * afterwards. The pure policy test (`npm run test:calls`) runs without a DB.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { signAccessToken } from '../src/lib/jwt.js';
import {
  acceptCall,
  cancelCall,
  declineCall,
  endCall,
  getCall,
  inviteCall,
  listCalls,
  listOversightCalls,
  missCall,
} from '../src/modules/calls/call.service.js';
import {
  getAppSettings,
  getCallRedactedLabels,
  getWhitelistedAppSettings,
  updateAppSettings,
} from '../src/modules/settings/appSetting.service.js';
import { DEFAULT_REDACTED_LABELS } from '../src/modules/calls/callView.service.js';

let passed = 0;
let skipped = 0;
const createdEmployees = [];
const createdCallIds = [];
let originalDirectorLabel = null;
let httpServer = null;
let httpBaseUrl = null;

const HIDDEN_SETTING_KEY = 'call.internal_hidden_test';
const ALLOWED_SETTING_KEYS = [
  'call.redacted_label.director',
  'call.redacted_label.deputy',
];

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

function skip(name, reason) {
  skipped += 1;
  console.log(`SKIP  ${name}\n      ${reason}`);
}

function tokenFor(employeeId, roles) {
  return signAccessToken({
    sub: crypto.randomUUID(),
    emp: employeeId,
    username: `test-${roles.join('-')}`,
    roles,
    perms: {},
  });
}

async function httpGet(path, token) {
  const res = await fetch(`${httpBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function startHttpServer() {
  if (!env.jwt.privateKey || !env.jwt.publicKey) {
    return false;
  }
  httpServer = createApp().listen(0);
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  const { port } = httpServer.address();
  httpBaseUrl = `http://127.0.0.1:${port}`;
  return true;
}

async function captureRejection(fn) {
  try {
    await fn();
    throw new Error('Expected the call to be rejected');
  } catch (err) {
    if (err.message === 'Expected the call to be rejected') throw err;
    return err;
  }
}

async function createEmployee(name, orgUnitId, isActive = 1) {
  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO employees
       (id, org_unit_id, code, full_name_ar, full_name_en, job_title_ar, presence, is_active)
     VALUES (?, ?, ?, ?, ?, 'موظف اختبار', 'offline', ?)`,
    [id, orgUnitId, `CALLTEST-${id.slice(0, 8)}`, name, name, isActive]
  );
  createdEmployees.push(id);
  return id;
}

async function invite(callerEmployeeId, calleeEmployeeId, callType = 'audio') {
  const call = await inviteCall({
    callerUser: { id: null, employeeId: callerEmployeeId },
    calleeEmployeeId,
    callType,
  });
  createdCallIds.push(call.id);
  return call;
}

async function notificationsForCall(callId) {
  const [rows] = await pool.execute(
    `SELECT n.id, n.type, n.title_ar, n.summary_ar, n.metadata, nr.employee_id
       FROM notifications n
       JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.callId')) = ?`,
    [callId]
  );
  return rows;
}

async function main() {
  const [orgRows] = await pool.query(
    `SELECT id, kind, name_ar
       FROM org_units
      WHERE deleted_at IS NULL AND is_active = 1
      ORDER BY sort_order, name_ar`
  );

  const rootUnit = orgRows.find((row) => row.kind === 'root');
  const deputyUnit = orgRows.find((row) => row.kind === 'deputy');
  const ordinaryUnitA =
    orgRows.find((row) => row.kind === 'directorate') ||
    orgRows.find((row) => row.kind === 'section') ||
    orgRows.find((row) => row.kind === 'office');
  const ordinaryUnitB =
    orgRows.find((row) => row.kind === 'section' && row.id !== ordinaryUnitA?.id) ||
    orgRows.find((row) => row.kind === 'directorate' && row.id !== ordinaryUnitA?.id) ||
    orgRows.find((row) => row.kind === 'office' && row.id !== ordinaryUnitA?.id);

  assert.ok(rootUnit, 'a root org unit is required (run migrations)');
  assert.ok(deputyUnit, 'a deputy org unit is required (run migrations)');
  assert.ok(ordinaryUnitA && ordinaryUnitB, 'two non-leadership org units are required');

  const employeeA = await createEmployee('موظف اختبار أ', ordinaryUnitA.id);
  const employeeB = await createEmployee('موظف اختبار ب', ordinaryUnitB.id);
  const directorEmployee = await createEmployee('مدير اختبار', rootUnit.id);
  const deputyEmployee = await createEmployee('وكيل اختبار', deputyUnit.id);
  const inactiveEmployee = await createEmployee('موظف غير نشط', ordinaryUnitA.id, 0);

  // --- baseline settings ----------------------------------------------------
  const settings = await getAppSettings();
  originalDirectorLabel = settings.values['call.redacted_label.director'];
  check('V018 seeded both redaction labels', () => {
    assert.ok(settings.values['call.redacted_label.director']);
    assert.ok(settings.values['call.redacted_label.deputy']);
  });

  const labels = await getCallRedactedLabels();
  check('label loader returns both labels', () => {
    assert.equal(typeof labels.director, 'string');
    assert.equal(typeof labels.deputy, 'string');
    assert.ok(labels.director.length > 0);
    assert.ok(labels.deputy.length > 0);
  });

  // The admin edit goes through the real updateAppSettings() and stays in
  // effect for the view/history/notification assertions below. It is restored
  // explicitly at the end of the run (and again in the finally block if an
  // assertion throws first).
  const EDITED_DIRECTOR_LABEL = 'مدير قابل للتعديل';
  const DEFAULT_DIRECTOR_LABEL =
    originalDirectorLabel || DEFAULT_REDACTED_LABELS.director;

  await updateAppSettings(
    { 'call.redacted_label.director': EDITED_DIRECTOR_LABEL },
    { id: null }
  );
  const edited = await getCallRedactedLabels();
  check('admin-editable director label is persisted', () =>
    assert.equal(edited.director, EDITED_DIRECTOR_LABEL)
  );

  // --- employee -> employee, different units --------------------------------
  const employeeCall = await invite(employeeA, employeeB);
  check('employee -> employee across units is allowed', () => {
    assert.equal(employeeCall.status, 'ringing');
    assert.equal(employeeCall.direction, 'outgoing');
    assert.equal(employeeCall.redacted, false);
    assert.equal(employeeCall.canCallBack, true);
    assert.equal(employeeCall.relayOnly, false);
    assert.equal(employeeCall.iceTransportPolicy, 'all');
  });

  const incomingEmployeeCall = await getCall(employeeCall.id, employeeB, {
    actorUserId: null,
  });
  check('ordinary incoming call is not redacted', () => {
    assert.equal(incomingEmployeeCall.direction, 'incoming');
    assert.equal(incomingEmployeeCall.redacted, false);
    assert.equal(incomingEmployeeCall.caller.employeeId, employeeA);
  });

  const history = await listCalls(employeeB);
  check('call history includes calls where the employee is the callee', () =>
    assert.ok(history.some((call) => call.id === employeeCall.id))
  );

  // --- employee -> leadership, generic denial -------------------------------
  const leadershipDenial = await captureRejection(() =>
    inviteCall({
      callerUser: { id: null, employeeId: employeeA },
      calleeEmployeeId: directorEmployee,
    })
  );
  const unknownDenial = await captureRejection(() =>
    inviteCall({
      callerUser: { id: null, employeeId: employeeA },
      calleeEmployeeId: crypto.randomUUID(),
    })
  );

  check('employee -> director is forbidden', () => {
    assert.equal(leadershipDenial.status, 403);
    assert.equal(leadershipDenial.code, 'CALL_TARGET_FORBIDDEN');
  });
  check('leadership and unknown targets return the same response', () => {
    assert.equal(leadershipDenial.status, unknownDenial.status);
    assert.equal(leadershipDenial.code, unknownDenial.code);
    assert.equal(leadershipDenial.message, unknownDenial.message);
  });

  const deputyDenial = await captureRejection(() =>
    inviteCall({
      callerUser: { id: null, employeeId: employeeA },
      calleeEmployeeId: deputyEmployee,
    })
  );
  check('employee -> deputy is forbidden', () =>
    assert.equal(deputyDenial.code, 'CALL_TARGET_FORBIDDEN')
  );

  const inactiveDenial = await captureRejection(() =>
    inviteCall({
      callerUser: { id: null, employeeId: employeeA },
      calleeEmployeeId: inactiveEmployee,
    })
  );
  check('inactive target is forbidden with the same public code', () =>
    assert.equal(inactiveDenial.code, 'CALL_TARGET_FORBIDDEN')
  );

  const [deniedRows] = await pool.execute(
    `SELECT metadata
       FROM audit_log
      WHERE action = 'call.denied'
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.callerEmployeeId')) = ?`,
    [employeeA]
  );
  const reasons = deniedRows.map((row) => JSON.parse(row.metadata).reason);
  check('every denied invite writes a call.denied audit row', () => {
    assert.ok(deniedRows.length >= 4);
    assert.ok(reasons.includes('TARGET_LEADERSHIP'));
    assert.ok(reasons.includes('TARGET_NOT_FOUND'));
    assert.ok(reasons.includes('TARGET_INACTIVE'));
  });

  // --- leadership -> anyone -------------------------------------------------
  const directorToEmployee = await invite(directorEmployee, employeeA);
  check('director -> employee is allowed and relay-only', () => {
    assert.equal(directorToEmployee.status, 'ringing');
    assert.equal(directorToEmployee.relayOnly, true);
    assert.equal(directorToEmployee.iceTransportPolicy, 'relay');
  });

  const employeeViewOfDirectorCall = await getCall(directorToEmployee.id, employeeA, {
    actorUserId: null,
  });
  check('callee sees a redacted leadership caller', () => {
    assert.equal(employeeViewOfDirectorCall.redacted, true);
    assert.equal(employeeViewOfDirectorCall.canCallBack, false);
    assert.equal(employeeViewOfDirectorCall.relayOnly, true);
    assert.equal(employeeViewOfDirectorCall.caller.employeeId, null);
    assert.equal(employeeViewOfDirectorCall.caller.name, EDITED_DIRECTOR_LABEL);
  });

  const editedHistory = await listCalls(employeeA);
  check('call history renders the current admin-edited label', () => {
    const entry = editedHistory.find((call) => call.id === directorToEmployee.id);
    assert.ok(entry, 'director call missing from the callee history');
    assert.equal(entry.redacted, true);
    assert.equal(entry.canCallBack, false);
    assert.equal(entry.caller.name, EDITED_DIRECTOR_LABEL);
  });

  const deputyToEmployee = await invite(deputyEmployee, employeeB);
  check('deputy -> employee is allowed', () =>
    assert.equal(deputyToEmployee.status, 'ringing')
  );

  const directorToDeputy = await invite(directorEmployee, deputyEmployee);
  check('director -> deputy is allowed', () =>
    assert.equal(directorToDeputy.status, 'ringing')
  );

  const deputyToDirector = await invite(deputyEmployee, directorEmployee);
  check('deputy -> director is allowed', () =>
    assert.equal(deputyToDirector.status, 'ringing')
  );

  const deputyViewOfDirector = await getCall(directorToDeputy.id, deputyEmployee, {
    actorUserId: null,
  });
  check('leadership-to-leadership call is not redacted but stays relay-only', () => {
    assert.equal(deputyViewOfDirector.redacted, false);
    assert.equal(deputyViewOfDirector.canCallBack, true);
    assert.equal(deputyViewOfDirector.iceTransportPolicy, 'relay');
  });

  // --- state transitions ----------------------------------------------------
  const accepted = await acceptCall(employeeCall.id, employeeB, { actorUserId: null });
  check('callee can accept a ringing call', () => {
    assert.equal(accepted.status, 'accepted');
    assert.ok(accepted.answeredAt);
  });

  const ended = await endCall(employeeCall.id, employeeB, { actorUserId: null });
  check('either participant can end an accepted call', () => {
    assert.equal(ended.status, 'ended');
    assert.ok(ended.endedAt);
  });

  const cancelTarget = await invite(employeeA, employeeB);
  const cancelled = await cancelCall(cancelTarget.id, employeeA, { actorUserId: null });
  check('caller can cancel a ringing call', () =>
    assert.equal(cancelled.status, 'cancelled')
  );

  const declineTarget = await invite(employeeA, employeeB);
  const declined = await declineCall(declineTarget.id, employeeB, { actorUserId: null });
  check('callee can reject a ringing call', () =>
    assert.equal(declined.status, 'rejected')
  );
  const declinedNotifications = await notificationsForCall(declineTarget.id);
  check('decline does not create a missed_call notification', () =>
    assert.equal(declinedNotifications.length, 0)
  );

  // --- missed_call notification --------------------------------------------
  const missedTarget = await invite(employeeA, employeeB);
  await missCall(missedTarget.id, employeeB, { actorUserId: null });
  const missedNotifications = await notificationsForCall(missedTarget.id);
  check('missed call creates exactly one missed_call notification', () => {
    assert.equal(missedNotifications.length, 1);
    assert.equal(missedNotifications[0].type, 'missed_call');
    assert.equal(missedNotifications[0].employee_id, employeeB);
    assert.match(missedNotifications[0].summary_ar, /مكالمة فائتة/);
  });

  check('ordinary missed_call payload is exactly { callId, label }', () => {
    const raw = missedNotifications[0].metadata;
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.deepEqual(metadata, {
      callId: missedTarget.id,
      label: 'موظف اختبار أ',
    });
  });

  const missedLeadershipTarget = await invite(directorEmployee, employeeA);
  await missCall(missedLeadershipTarget.id, employeeA, { actorUserId: null });
  const missedLeadershipNotifications = await notificationsForCall(missedLeadershipTarget.id);
  check('missed leadership call uses the redacted label in the notification', () => {
    assert.equal(missedLeadershipNotifications.length, 1);
    assert.equal(
      missedLeadershipNotifications[0].summary_ar,
      `مكالمة فائتة من ${EDITED_DIRECTOR_LABEL}`
    );
    assert.equal(
      missedLeadershipNotifications[0].summary_ar.includes('مدير اختبار'),
      false
    );
  });

  check('redacted missed_call payload is exactly { callId, label }', () => {
    const raw = missedLeadershipNotifications[0].metadata;
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.deepEqual(metadata, {
      callId: missedLeadershipTarget.id,
      label: EDITED_DIRECTOR_LABEL,
    });
    assert.equal('redacted' in metadata, false);
    assert.equal('callerEmployeeId' in metadata, false);
  });

  // --- restoring the default label takes effect immediately -----------------
  await updateAppSettings(
    { 'call.redacted_label.director': DEFAULT_DIRECTOR_LABEL },
    { id: null }
  );

  const restoredLabels = await getCallRedactedLabels();
  check('restoring the default label is reflected by the loader', () =>
    assert.equal(restoredLabels.director, DEFAULT_DIRECTOR_LABEL)
  );

  const restoredView = await getCall(directorToEmployee.id, employeeA, {
    actorUserId: null,
  });
  check('an existing redacted call shows the restored label on the next view', () => {
    assert.equal(restoredView.redacted, true);
    assert.equal(restoredView.caller.name, DEFAULT_DIRECTOR_LABEL);
  });

  const restoredHistory = await listCalls(employeeA);
  check('call history shows the restored label', () => {
    const entry = restoredHistory.find((call) => call.id === directorToEmployee.id);
    assert.ok(entry, 'director call missing from the callee history');
    assert.equal(entry.caller.name, DEFAULT_DIRECTOR_LABEL);
  });

  const restoredMissTarget = await invite(directorEmployee, employeeA);
  await missCall(restoredMissTarget.id, employeeA, { actorUserId: null });
  const restoredMissNotifications = await notificationsForCall(restoredMissTarget.id);
  check('a missed_call created after restoring uses the default label', () => {
    assert.equal(restoredMissNotifications.length, 1);
    assert.equal(
      restoredMissNotifications[0].summary_ar,
      `مكالمة فائتة من ${DEFAULT_DIRECTOR_LABEL}`
    );
  });

  check('an existing missed_call notification keeps its stored text', () =>
    assert.equal(
      missedLeadershipNotifications[0].summary_ar,
      `مكالمة فائتة من ${EDITED_DIRECTOR_LABEL}`
    )
  );

  // --- oversight feed (admin / auditor, metadata only) ----------------------
  const oversight = await listOversightCalls({ limit: 200 });
  const oversightIds = oversight.map((entry) => entry.id);

  check('oversight includes leadership-involving calls', () => {
    assert.ok(oversightIds.includes(directorToEmployee.id));
    assert.ok(oversightIds.includes(deputyToEmployee.id));
    assert.ok(oversightIds.includes(directorToDeputy.id));
  });

  check('oversight excludes employee-to-employee calls', () => {
    assert.equal(oversightIds.includes(employeeCall.id), false);
  });

  check('oversight returns metadata only (no participant identity)', () => {
    const entry = oversight.find((item) => item.id === directorToEmployee.id);
    assert.ok(entry, 'leadership call missing from oversight');
    assert.equal(entry.metadata.callerOrgUnitKind, 'root');
    for (const key of ['caller', 'callee', 'callerEmployeeId', 'calleeEmployeeId']) {
      assert.equal(key in entry, false, `oversight leaked ${key}`);
    }
    const serialized = JSON.stringify(entry);
    assert.equal(serialized.includes('مدير اختبار'), false);
    assert.equal(serialized.includes('موظف اختبار أ'), false);
  });

  // --- settings read allowlist ---------------------------------------------
  await pool.execute(
    `INSERT INTO app_settings (\`key\`, \`value\`)
     VALUES (?, 'hidden')
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    [HIDDEN_SETTING_KEY]
  );

  const publicSettings = await getWhitelistedAppSettings();
  check('settings read path returns only allowlisted keys', () => {
    assert.deepEqual(
      Object.keys(publicSettings.values).sort(),
      [...ALLOWED_SETTING_KEYS].sort()
    );
    assert.equal(HIDDEN_SETTING_KEY in publicSettings.values, false);
    assert.equal(
      publicSettings.items.some((item) => item.key === HIDDEN_SETTING_KEY),
      false
    );
  });

  // --- HTTP-level checks for the same two read paths -----------------------
  const httpReady = await startHttpServer();
  if (!httpReady) {
    skip('HTTP settings/oversight checks', 'JWT keys are not configured');
  } else {
    const employeeToken = tokenFor(employeeA, ['employee']);
    const auditorToken = tokenFor(employeeB, ['auditor']);
    const adminToken = tokenFor(directorEmployee, ['admin']);

    const settingsResponse = await httpGet('/api/settings/app', employeeToken);
    check('GET /api/settings/app returns only allowlisted keys', () => {
      assert.equal(settingsResponse.status, 200);
      assert.deepEqual(
        Object.keys(settingsResponse.body.settings).sort(),
        [...ALLOWED_SETTING_KEYS].sort()
      );
      assert.equal(
        settingsResponse.body.items.some((item) => item.key === HIDDEN_SETTING_KEY),
        false
      );
    });

    const employeeOversight = await httpGet('/api/calls/oversight', employeeToken);
    check('ordinary employee cannot read the oversight feed', () =>
      assert.equal(employeeOversight.status, 403)
    );

    const auditorOversight = await httpGet('/api/calls/oversight?limit=200', auditorToken);
    check('auditor reads the metadata-only oversight feed', () => {
      assert.equal(auditorOversight.status, 200);
      const ids = auditorOversight.body.calls.map((entry) => entry.id);
      assert.ok(ids.includes(directorToEmployee.id));
      assert.equal(ids.includes(employeeCall.id), false);
      const entry = auditorOversight.body.calls.find(
        (item) => item.id === directorToEmployee.id
      );
      assert.ok(entry);
      assert.equal('caller' in entry, false);
      assert.equal('callee' in entry, false);
      assert.equal('callerEmployeeId' in entry, false);
      assert.equal('calleeEmployeeId' in entry, false);
    });

    const adminOversight = await httpGet('/api/calls/oversight?limit=200', adminToken);
    check('admin reads the same metadata-only oversight feed', () =>
      assert.equal(adminOversight.status, 200)
    );
  }

  // --- non-participant access ----------------------------------------------
  const outsiderDenial = await captureRejection(() =>
    getCall(employeeCall.id, deputyEmployee, { actorUserId: null })
  );
  check('non-participant cannot read a call', () =>
    assert.equal(outsiderDenial.code, 'CALL_FORBIDDEN')
  );
}

try {
  await main();
} catch (err) {
  console.error('[test:calls:db] error:', err);
  process.exitCode = 1;
} finally {
  // Always leave the seeded/previous label behind, even if the run threw
  // before reaching the explicit restore check.
  await updateAppSettings(
    {
      'call.redacted_label.director':
        originalDirectorLabel || DEFAULT_REDACTED_LABELS.director,
    },
    { id: null }
  ).catch(() => {});

  await pool
    .execute(`DELETE FROM app_settings WHERE \`key\` = ?`, [HIDDEN_SETTING_KEY])
    .catch(() => {});

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  if (createdEmployees.length > 0) {
    const placeholders = createdEmployees.map(() => '?').join(', ');
    const callPlaceholders = createdCallIds.map(() => '?').join(', ');
    if (createdCallIds.length > 0) {
      await pool
        .execute(
          `DELETE FROM notifications
            WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.callId')) IN (${callPlaceholders})`,
          createdCallIds
        )
        .catch(() => {});
    }
    await pool
      .execute(
        `DELETE FROM notification_recipients WHERE employee_id IN (${placeholders})`,
        createdEmployees
      )
      .catch(() => {});
    await pool
      .execute(
        `DELETE FROM audit_log
          WHERE action = 'call.denied'
            AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.callerEmployeeId')) IN (${placeholders})`,
        createdEmployees
      )
      .catch(() => {});
    await pool
      .execute(
        `DELETE FROM calls
          WHERE caller_employee_id IN (${placeholders})
             OR callee_employee_id IN (${placeholders})`,
        [...createdEmployees, ...createdEmployees]
      )
      .catch(() => {});
    await pool
      .execute(
        `DELETE FROM employees WHERE id IN (${placeholders})`,
        createdEmployees
      )
      .catch(() => {});
  }
  console.log(
    `\n[test:calls:db] ${passed} checks passed` +
      (skipped > 0 ? `, ${skipped} skipped` : '')
  );
  await pool.end();
}
