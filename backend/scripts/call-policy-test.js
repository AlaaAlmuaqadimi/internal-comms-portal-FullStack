/**
 * Pure call policy and redaction tests (no database, no HTTP server).
 *
 *   npm run test:calls --prefix backend
 *
 * Covers the locked Phase A rules:
 *   - employee -> employee across any units is allowed
 *   - employee -> Director/Deputy is forbidden
 *   - Director/Deputy -> anyone (including each other) is allowed
 *   - inactive / unknown targets are denied
 *   - target denials expose the same public response
 *   - callee-side redaction, canCallBack and relay-only ICE deep-equal shapes
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALL_DENIAL_CODES,
  CALL_DENIAL_REASONS,
  canCall,
  evaluateCallPermission,
  isLeadershipKind,
} from '../src/modules/calls/callAuth.service.js';
import {
  DEFAULT_REDACTED_LABELS,
  buildCallView,
} from '../src/modules/calls/callView.service.js';
import { canOverseeCalls, isAdmin, isAuditor } from '../src/lib/roles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

function participant(overrides = {}) {
  return {
    employeeId: '00000000-0000-0000-0000-000000000001',
    name: 'موظف',
    nameEn: 'Employee',
    avatarUrl: null,
    unitId: '10000000-0000-0000-0000-000000000001',
    unitName: 'قسم',
    unitNameEn: 'Section',
    orgUnitKind: 'section',
    isActive: true,
    ...overrides,
  };
}

const employeeA = participant({
  employeeId: '00000000-0000-0000-0000-000000000001',
  name: 'أحمد',
  nameEn: 'Ahmed',
  unitId: '10000000-0000-0000-0000-000000000001',
  unitName: 'قسم البرمجيات',
  unitNameEn: 'Software Section',
  orgUnitKind: 'section',
});

const employeeB = participant({
  employeeId: '00000000-0000-0000-0000-000000000002',
  name: 'فاطمة',
  nameEn: 'Fatima',
  unitId: '10000000-0000-0000-0000-000000000002',
  unitName: 'إدارة الموارد البشرية',
  unitNameEn: 'Human Resources Directorate',
  orgUnitKind: 'directorate',
});

const director = participant({
  employeeId: '00000000-0000-0000-0000-000000000003',
  name: 'المدير',
  nameEn: 'Director',
  unitId: '10000000-0000-0000-0000-000000000003',
  unitName: 'رئاسة المصلحة',
  unitNameEn: 'Authority Head',
  orgUnitKind: 'root',
});

const deputy = participant({
  employeeId: '00000000-0000-0000-0000-000000000004',
  name: 'الوكيل',
  nameEn: 'Deputy',
  unitId: '10000000-0000-0000-0000-000000000004',
  unitName: 'وكالة المصلحة',
  unitNameEn: 'Deputy Office',
  orgUnitKind: 'deputy',
});

const inactiveEmployee = participant({
  employeeId: '00000000-0000-0000-0000-000000000005',
  name: 'موظف غير نشط',
  nameEn: 'Inactive Employee',
  isActive: false,
});

// --- leadership kind ------------------------------------------------------

check('root and deputy are the only leadership kinds', () => {
  assert.equal(isLeadershipKind('root'), true);
  assert.equal(isLeadershipKind('deputy'), true);
  for (const kind of ['office', 'directorate', 'section', 'group', null, undefined, '']) {
    assert.equal(isLeadershipKind(kind), false, `unexpected leadership kind: ${kind}`);
  }
});

// --- allowed matrix -------------------------------------------------------

check('employee may call another employee across different units', () => {
  const decision = evaluateCallPermission(employeeA, employeeB);
  assert.deepEqual(decision, { allowed: true, code: null, reason: null });
  assert.equal(canCall(employeeA, employeeB), true);
});

check('wrapped input form works', () => {
  assert.deepEqual(evaluateCallPermission({ caller: employeeA, target: employeeB }), {
    allowed: true,
    code: null,
    reason: null,
  });
  assert.equal(canCall({ caller: employeeA, callee: employeeB }), true);
});

check('director may call any employee', () => {
  assert.equal(canCall(director, employeeA), true);
  assert.equal(canCall(director, employeeB), true);
});

check('deputy may call any employee', () => {
  assert.equal(canCall(deputy, employeeA), true);
  assert.equal(canCall(deputy, employeeB), true);
});

check('director and deputy may call each other', () => {
  assert.equal(canCall(director, deputy), true);
  assert.equal(canCall(deputy, director), true);
});

check('leadership may call an inactive target (target check still applies)', () => {
  assert.equal(canCall(director, inactiveEmployee), false);
});

// --- forbidden matrix -----------------------------------------------------

function expectTargetForbidden(caller, target, reason) {
  const decision = evaluateCallPermission(caller, target);
  assert.deepEqual(decision, {
    allowed: false,
    code: CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN,
    reason,
  });
  return decision;
}

check('employee may not call the director', () => {
  expectTargetForbidden(employeeA, director, CALL_DENIAL_REASONS.TARGET_LEADERSHIP);
});

check('employee may not call the deputy', () => {
  expectTargetForbidden(employeeA, deputy, CALL_DENIAL_REASONS.TARGET_LEADERSHIP);
});

check('same public response for existing leadership target and unknown target', () => {
  const leadershipDecision = expectTargetForbidden(
    employeeA,
    director,
    CALL_DENIAL_REASONS.TARGET_LEADERSHIP
  );
  const unknownDecision = expectTargetForbidden(
    employeeA,
    null,
    CALL_DENIAL_REASONS.TARGET_NOT_FOUND
  );
  assert.equal(leadershipDecision.code, unknownDecision.code);
});

check('inactive target is denied with the same public code', () => {
  const decision = expectTargetForbidden(
    employeeA,
    inactiveEmployee,
    CALL_DENIAL_REASONS.TARGET_INACTIVE
  );
  assert.equal(decision.code, CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN);
});

check('unknown target is denied', () => {
  expectTargetForbidden(employeeA, undefined, CALL_DENIAL_REASONS.TARGET_NOT_FOUND);
});

check('self-call is denied even for leadership', () => {
  expectTargetForbidden(director, director, CALL_DENIAL_REASONS.SELF_CALL);
  expectTargetForbidden(employeeA, employeeA, CALL_DENIAL_REASONS.SELF_CALL);
});

check('inactive caller is denied', () => {
  assert.deepEqual(evaluateCallPermission(inactiveEmployee, employeeA), {
    allowed: false,
    code: CALL_DENIAL_CODES.CALLER_INACTIVE,
    reason: CALL_DENIAL_REASONS.CALLER_INACTIVE,
  });
});

// --- redaction deep-equal shapes -----------------------------------------

const ordinaryCall = {
  id: '20000000-0000-0000-0000-000000000001',
  callerEmployeeId: employeeA.employeeId,
  calleeEmployeeId: employeeB.employeeId,
  callType: 'audio',
  status: 'ringing',
  initiatedAt: '2026-01-01T10:00:00.000Z',
  answeredAt: null,
  endedAt: null,
  durationSeconds: 0,
  metadata: {
    callerOrgUnitKind: 'section',
    calleeOrgUnitKind: 'directorate',
  },
};

const leadershipCall = {
  ...ordinaryCall,
  id: '20000000-0000-0000-0000-000000000002',
  callerEmployeeId: director.employeeId,
  calleeEmployeeId: employeeA.employeeId,
  metadata: {
    callerOrgUnitKind: 'root',
    calleeOrgUnitKind: 'section',
  },
};

function normalized(p) {
  return {
    employeeId: p.employeeId,
    name: p.name,
    nameEn: p.nameEn,
    avatarUrl: p.avatarUrl,
    unitId: p.unitId,
    unitName: p.unitName,
    unitNameEn: p.unitNameEn,
    orgUnitKind: p.orgUnitKind,
    isLeadership: isLeadershipKind(p.orgUnitKind),
  };
}

check('ordinary call view is not redacted and uses direct ICE (deep equal)', () => {
  const view = buildCallView({
    call: ordinaryCall,
    viewerEmployeeId: employeeB.employeeId,
    caller: employeeA,
    callee: employeeB,
  });
  assert.deepEqual(view, {
    id: ordinaryCall.id,
    status: 'ringing',
    callType: 'audio',
    direction: 'incoming',
    initiatedAt: '2026-01-01T10:00:00.000Z',
    answeredAt: null,
    endedAt: null,
    durationSeconds: 0,
    redacted: false,
    canCallBack: true,
    relayOnly: false,
    iceTransportPolicy: 'all',
    caller: normalized(employeeA),
    callee: normalized(employeeB),
  });
});

check('director call is redacted on the callee side (deep equal)', () => {
  const view = buildCallView({
    call: leadershipCall,
    viewerEmployeeId: employeeA.employeeId,
    caller: director,
    callee: employeeA,
  });
  assert.deepEqual(view, {
    id: leadershipCall.id,
    status: 'ringing',
    callType: 'audio',
    direction: 'incoming',
    initiatedAt: '2026-01-01T10:00:00.000Z',
    answeredAt: null,
    endedAt: null,
    durationSeconds: 0,
    redacted: true,
    canCallBack: false,
    relayOnly: true,
    iceTransportPolicy: 'relay',
    caller: {
      employeeId: null,
      name: DEFAULT_REDACTED_LABELS.director,
      nameEn: DEFAULT_REDACTED_LABELS.director,
      avatarUrl: null,
      unitId: null,
      unitName: null,
      unitNameEn: null,
      orgUnitKind: null,
      isLeadership: true,
      redacted: true,
    },
    callee: normalized(employeeA),
  });
});

check('deputy call uses the deputy redacted label (deep equal)', () => {
  const call = {
    ...leadershipCall,
    id: '20000000-0000-0000-0000-000000000003',
    callerEmployeeId: deputy.employeeId,
    metadata: {
      callerOrgUnitKind: 'deputy',
      calleeOrgUnitKind: 'section',
    },
  };
  const view = buildCallView({
    call,
    viewerEmployeeId: employeeA.employeeId,
    caller: deputy,
    callee: employeeA,
  });
  assert.equal(view.caller.name, DEFAULT_REDACTED_LABELS.deputy);
  assert.equal(view.caller.nameEn, DEFAULT_REDACTED_LABELS.deputy);
  assert.equal(view.canCallBack, false);
  assert.equal(view.iceTransportPolicy, 'relay');
});

check('custom admin labels are applied', () => {
  const view = buildCallView({
    call: leadershipCall,
    viewerEmployeeId: employeeA.employeeId,
    caller: director,
    callee: employeeA,
    labels: { director: 'مدير مخصص', deputy: 'وكيل مخصص' },
  });
  assert.equal(view.caller.name, 'مدير مخصص');
});

check('the caller still sees the real callee and is not redacted', () => {
  const view = buildCallView({
    call: leadershipCall,
    viewerEmployeeId: director.employeeId,
    caller: director,
    callee: employeeA,
  });
  assert.equal(view.direction, 'outgoing');
  assert.equal(view.redacted, false);
  assert.equal(view.canCallBack, true);
  assert.equal(view.relayOnly, true);
  assert.equal(view.iceTransportPolicy, 'relay');
  assert.deepEqual(view.caller, normalized(director));
  assert.deepEqual(view.callee, normalized(employeeA));
});

check('leadership-to-leadership call is relay-only but not redacted', () => {
  const call = {
    ...leadershipCall,
    calleeEmployeeId: deputy.employeeId,
    metadata: {
      callerOrgUnitKind: 'root',
      calleeOrgUnitKind: 'deputy',
    },
  };
  const view = buildCallView({
    call,
    viewerEmployeeId: deputy.employeeId,
    caller: director,
    callee: deputy,
  });
  assert.equal(view.redacted, false);
  assert.equal(view.canCallBack, true);
  assert.equal(view.iceTransportPolicy, 'relay');
  assert.deepEqual(view.caller, normalized(director));
});

check('metadata snapshot keeps old call redacted after an org-unit move', () => {
  const movedDirector = { ...director, orgUnitKind: 'office' };
  const view = buildCallView({
    call: leadershipCall,
    viewerEmployeeId: employeeA.employeeId,
    caller: movedDirector,
    callee: employeeA,
  });
  assert.equal(view.redacted, true);
  assert.equal(view.caller.name, DEFAULT_REDACTED_LABELS.director);
});

check('database-shaped snake_case rows and JSON metadata are accepted', () => {
  const view = buildCallView({
    call: {
      id: ordinaryCall.id,
      callerEmployeeId: undefined,
      calleeEmployeeId: undefined,
      caller_employee_id: ordinaryCall.callerEmployeeId,
      callee_employee_id: ordinaryCall.calleeEmployeeId,
      callType: undefined,
      call_type: 'video',
      status: 'ringing',
      initiatedAt: undefined,
      initiated_at: '2026-01-01T10:00:00.000Z',
      answeredAt: null,
      endedAt: null,
      durationSeconds: undefined,
      duration_seconds: 12,
      metadata: JSON.stringify({ callerOrgUnitKind: 'section', calleeOrgUnitKind: 'directorate' }),
    },
    viewerEmployeeId: employeeA.employeeId,
    caller: { ...employeeA, employee_id: employeeA.employeeId },
    callee: { ...employeeB, employee_id: employeeB.employeeId },
  });
  assert.equal(view.callType, 'video');
  assert.equal(view.durationSeconds, 12);
  assert.equal(view.direction, 'outgoing');
});

// --- source / migration guardrails ---------------------------------------

check('callAuth.service.js stays pure (no database import)', () => {
  const source = fs.readFileSync(
    path.join(here, '..', 'src', 'modules', 'calls', 'callAuth.service.js'),
    'utf8'
  );
  assert.equal(/from ['"].*db\//.test(source), false);
  assert.equal(/employee_contacts/.test(source), false);
});

check('call authorization does not use employee_contacts or a manager column', () => {
  for (const file of ['callAuth.service.js', 'call.service.js']) {
    const source = fs.readFileSync(
      path.join(here, '..', 'src', 'modules', 'calls', file),
      'utf8'
    );
    assert.equal(/employee_contacts/.test(source), false, `${file} uses employee_contacts`);
    assert.equal(/head_employee_id|headEmployeeId|manager_id|managerId/.test(source), false);
  }
});

check('V018 creates app_settings and seeds both redaction labels', () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, 'database', 'migrations', 'V018__call_settings.sql'),
    'utf8'
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(sql, /call\.redacted_label\.director/);
  assert.match(sql, /call\.redacted_label\.deputy/);
  assert.match(sql, /المدير العام/);
  assert.match(sql, /وكيل المصلحة/);
  assert.equal(/head_employee_id|manager_id/.test(sql), false);
});

check('only admin and auditor may read the call oversight feed', () => {
  assert.equal(isAdmin({ roles: ['admin'] }), true);
  assert.equal(isAuditor({ roles: ['auditor'] }), true);
  assert.equal(canOverseeCalls({ roles: ['admin'] }), true);
  assert.equal(canOverseeCalls({ roles: ['auditor'] }), true);
  assert.equal(canOverseeCalls({ roles: ['employee'] }), false);
  assert.equal(canOverseeCalls({ roles: ['supervisor', 'employee'] }), false);
  assert.equal(canOverseeCalls({ roles: [] }), false);
  assert.equal(canOverseeCalls(null), false);
});

check('V019 aligns call statuses with the safe three-step enum migration', () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, 'database', 'migrations', 'V019__align_call_statuses.sql'),
    'utf8'
  );
  const expanded =
    "ENUM('ringing','answered','declined','accepted','rejected','missed','cancelled','ended','busy','failed')";
  const final =
    "ENUM('ringing','accepted','rejected','missed','cancelled','ended','busy','failed')";

  const expandAt = sql.indexOf(expanded);
  const acceptedUpdateAt = sql.indexOf("SET status = 'accepted' WHERE status = 'answered'");
  const rejectedUpdateAt = sql.indexOf("SET status = 'rejected' WHERE status = 'declined'");
  const shrinkAt = sql.indexOf(final);

  assert.ok(expandAt !== -1, 'expanded enum missing');
  assert.ok(acceptedUpdateAt !== -1, 'accepted UPDATE missing');
  assert.ok(rejectedUpdateAt !== -1, 'rejected UPDATE missing');
  assert.ok(shrinkAt !== -1, 'final enum missing');
  assert.ok(expandAt < acceptedUpdateAt, 'enum must expand before the data update');
  assert.ok(expandAt < rejectedUpdateAt, 'enum must expand before the data update');
  assert.ok(shrinkAt > acceptedUpdateAt, 'enum must shrink after the data update');
  assert.ok(shrinkAt > rejectedUpdateAt, 'enum must shrink after the data update');
  assert.equal(
    /CREATE TABLE.*call_participants|ADD COLUMN.*ring_expires_at/i.test(sql),
    false,
    'V019 must only align statuses'
  );
});

console.log(`\n[test:calls] ${passed} checks passed`);
