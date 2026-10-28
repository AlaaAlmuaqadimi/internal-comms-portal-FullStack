/**
 * Org tree smoke test (database service layer, no HTTP server needed).
 *
 *   npm run test:org --prefix backend
 *
 * Creates a disposable subtree under the existing Head, verifies the V009
 * Head reporting lines (office, deputy, sub-offices, administrations,
 * planning/evasion/IT directorates and the regional executive administrations
 * all directly under u77), confirms that only the `admin` role holds
 * management permissions, checks that V012 flattened the legacy deputy regions
 * while u35 keeps its own directorates, exercises the tree builder, move/cycle
 * rules, scope filtering, delete guards and restore, then hard-deletes its own
 * rows. Requires the migrations to have been applied.
 */
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import * as org from '../src/modules/org/org.service.js';

const prefix = `T${Date.now().toString(36).toUpperCase()}`;
const created = [];
const actor = { id: null, isGlobal: true, scopes: [] };

// V009 legacy containers and their regional directorates. u35 is a real
// directorate under the Head and keeps u24..u34. u75 is a legacy deputy-level
// container, so V012 flattens u59..u74 directly under the Head.
const LEGACY_GROUP_CODES = ['u35', 'u75'];
const U35_REGIONAL_CODES = ['u24', 'u25', 'u26', 'u27', 'u28', 'u29', 'u30', 'u31', 'u32', 'u33', 'u34'];
const U75_REGIONAL_CODES = [
  'u59', 'u60', 'u61', 'u62', 'u63', 'u64', 'u65', 'u66', 'u67', 'u68', 'u69', 'u70', 'u71',
  'u72', 'u73', 'u74',
];

// V009 reporting lines: the Head office, the deputy, the five sub-offices, the
// four general administrations, the planning / tax-evasion / IT directorates
// and the regional executive administrations all report directly to the Head.
// Each administration/directorate keeps its own sections or children.
const HEAD_OFFICE_CODE = 'u36';
const HEAD_DEPUTY_CODE = 'u76';
const HEAD_SUB_OFFICE_CODES = ['u1', 'u2', 'u3', 'u4', 'u5'];
const HEAD_ADMINISTRATION_CODES = ['u8', 'u15', 'u19', 'u23'];
// These three directorates report to the Head, not to the deputy (u76).
const HEAD_DIRECTORATE_CODES = ['u49', 'u52', 'u58'];
// u35 reports to the Head and keeps its 11 regional directorates.
const HEAD_REGIONAL_GROUP_CODE = 'u35';
const HEAD_DIRECT_CHILD_ORDER = [
  HEAD_OFFICE_CODE,
  HEAD_DEPUTY_CODE,
  ...HEAD_SUB_OFFICE_CODES,
  ...HEAD_ADMINISTRATION_CODES,
  ...HEAD_DIRECTORATE_CODES,
  HEAD_REGIONAL_GROUP_CODE,
];
const ADMINISTRATION_SECTIONS = {
  u8: ['u6', 'u7'],
  u15: ['u9', 'u10', 'u11', 'u12', 'u13', 'u14'],
  u19: ['u16', 'u17', 'u18'],
  u23: ['u20', 'u21', 'u22'],
};
const DIRECTORATE_SECTIONS = {
  u49: ['u46', 'u47', 'u48'],
  u52: ['u50', 'u51'],
  u58: ['u53', 'u54', 'u55', 'u56', 'u57'],
};

// The simplified RBAC model grants these only to the Super Admin.
const MANAGEMENT_PERMISSION_CODES = [
  'org.manage',
  'users.manage',
  'roles.manage',
  'employees.manage',
  'notifications.broadcast',
];

async function assertAdminOnlyManagementPermissions() {
  const [rows] = await pool.execute(
    `SELECT r.code AS role_code, p.code AS permission_code
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.code IN (${MANAGEMENT_PERMISSION_CODES.map(() => '?').join(', ')})`,
    MANAGEMENT_PERMISSION_CODES
  );

  const adminPermissions = new Set(
    rows.filter((row) => row.role_code === 'admin').map((row) => row.permission_code)
  );
  for (const code of MANAGEMENT_PERMISSION_CODES) {
    assert.ok(adminPermissions.has(code), `The admin role is missing ${code}`);
  }

  const nonAdminRows = rows.filter((row) => row.role_code !== 'admin');
  assert.deepEqual(
    nonAdminRows,
    [],
    `Management permissions must be admin-only: ${JSON.stringify(nonAdminRows)}`
  );
}

async function assertHeadReportingLines(root) {
  const directCodes = HEAD_DIRECT_CHILD_ORDER;
  const [rows] = await pool.execute(
    `SELECT code, parent_id, kind, is_active FROM org_units
     WHERE code IN (${directCodes.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
    directCodes
  );
  assert.equal(rows.length, directCodes.length, 'Not all Head-level units were found');
  for (const row of rows) {
    assert.equal(row.parent_id, root.id, `${row.code} must report directly to the Head`);
    assert.equal(row.is_active, 1, `${row.code} should remain active`);
  }

  const allSections = { ...ADMINISTRATION_SECTIONS, ...DIRECTORATE_SECTIONS };
  const sectionCodes = Object.values(allSections).flat();
  const expectedParent = new Map();
  for (const [adminCode, codes] of Object.entries(allSections)) {
    for (const code of codes) expectedParent.set(code, adminCode);
  }

  const [sections] = await pool.execute(
    `SELECT child.code, child.kind, parent.code AS parent_code
     FROM org_units child
     JOIN org_units parent ON parent.id = child.parent_id
     WHERE child.code IN (${sectionCodes.map(() => '?').join(', ')}) AND child.deleted_at IS NULL`,
    sectionCodes
  );
  assert.equal(sections.length, sectionCodes.length, 'Not all administration sections were found');
  for (const section of sections) {
    assert.equal(
      section.parent_code,
      expectedParent.get(section.code),
      `${section.code} must remain under its administration`
    );
    assert.equal(section.kind, 'section', `${section.code} should remain a section`);
  }

  const tree = await org.getOrgTree({}, actor);
  const rootNode = tree.find((node) => node.id === root.id);
  assert.ok(rootNode, 'Root missing from the service tree');
  assert.deepEqual(
    rootNode.children.slice(0, HEAD_DIRECT_CHILD_ORDER.length).map((node) => node.code),
    HEAD_DIRECT_CHILD_ORDER,
    'Head-level children are not in the expected order'
  );
}

async function assertNormalizedLegacyTree(root) {
  const [groups] = await pool.execute(
    `SELECT id, code FROM org_units
     WHERE code IN (${LEGACY_GROUP_CODES.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
    LEGACY_GROUP_CODES
  );
  assert.deepEqual(
    groups.map((group) => group.code).sort(),
    [...LEGACY_GROUP_CODES].sort(),
    'V009/V012 legacy group containers are missing'
  );
  const groupByCode = new Map(groups.map((group) => [group.code, group]));

  // u35 reports to the Head and keeps u24..u34 underneath it.
  const u35 = groupByCode.get('u35');
  const [[u35Row]] = await pool.execute(
    'SELECT parent_id, kind FROM org_units WHERE id = ?',
    [u35.id]
  );
  assert.equal(u35Row.parent_id, root.id, 'u35 must report directly to the Head');

  const [u35Children] = await pool.execute(
    `SELECT code, kind, parent_id FROM org_units
     WHERE parent_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, code`,
    [u35.id]
  );
  assert.deepEqual(
    u35Children.map((unit) => unit.code),
    U35_REGIONAL_CODES,
    'u24..u34 must remain under u35 in their original order'
  );
  for (const child of u35Children) {
    assert.equal(child.parent_id, u35.id, `${child.code} must stay under u35`);
    assert.equal(child.kind, 'directorate', `${child.code} should remain a directorate`);
  }

  // u75 is a legacy deputy container: V012 flattens its children onto the root.
  const u75 = groupByCode.get('u75');
  const [remainingChildren] = await pool.execute(
    'SELECT code FROM org_units WHERE parent_id = ? AND deleted_at IS NULL',
    [u75.id]
  );
  assert.deepEqual(
    remainingChildren.map((unit) => unit.code),
    [],
    'V012 did not flatten every regional unit out of u75'
  );
  assert.deepEqual(
    await org.getChildren(u75.id, actor),
    [],
    'Legacy u75 group still has children in the service tree'
  );

  const [regions] = await pool.execute(
    `SELECT id, code, parent_id, kind, sort_order, is_active FROM org_units
     WHERE code IN (${U75_REGIONAL_CODES.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
    U75_REGIONAL_CODES
  );
  assert.equal(
    regions.length,
    U75_REGIONAL_CODES.length,
    'Not all 16 deputy regional units were found'
  );
  for (const region of regions) {
    assert.equal(region.parent_id, root.id, `${region.code} is not a direct child of the Head`);
    assert.equal(region.kind, 'directorate', `${region.code} should remain a directorate`);
    assert.equal(region.is_active, 1, `${region.code} should remain active`);
  }

  const baselineTree = await org.getOrgTree({}, actor);
  const baselineRoot = baselineTree.find((node) => node.id === root.id);
  assert.ok(baselineRoot, 'Root missing from the service tree');

  const rootChildren = baselineRoot.children;
  const regionalSet = new Set(U75_REGIONAL_CODES);
  const regionsInRoot = rootChildren.filter((node) => regionalSet.has(node.code));
  assert.equal(
    regionsInRoot.length,
    U75_REGIONAL_CODES.length,
    'Not all deputy regions are root children'
  );
  assert.ok(
    !rootChildren.some((node) => U35_REGIONAL_CODES.includes(node.code)),
    'u24..u34 must not be promoted to root children'
  );

  const u35InRoot = rootChildren.find((node) => node.code === 'u35');
  assert.ok(u35InRoot, 'u35 is missing from the root children');
  assert.deepEqual(
    u35InRoot.children.map((node) => node.code),
    U35_REGIONAL_CODES,
    'u35 regional directorates are not in the expected order'
  );

  // V012 deliberately appends the deputy regions after the existing root
  // children and preserves their relative order through the sort_order base.
  const firstRegionalIndex = rootChildren.findIndex((node) => regionalSet.has(node.code));
  const officeIndex = rootChildren.findIndex((node) => node.code === 'u36');
  const deputyIndex = rootChildren.findIndex((node) => node.code === 'u76');
  assert.ok(officeIndex !== -1 && deputyIndex !== -1, 'Head office/deputy root children are missing');
  assert.ok(firstRegionalIndex > officeIndex && firstRegionalIndex > deputyIndex);
  assert.deepEqual(
    rootChildren.filter((node) => U75_REGIONAL_CODES.includes(node.code)).map((node) => node.code),
    U75_REGIONAL_CODES
  );
}

async function make(fields) {
  const unit = await org.createOrgUnit(
    { code: `${prefix}-${created.length + 1}`, ...fields },
    actor,
    {}
  );
  created.push(unit.id);
  return unit;
}

async function expectCode(fn, code) {
  try {
    await fn();
  } catch (err) {
    assert.equal(err.code, code);
    return err;
  }
  assert.fail(`Expected ${code}`);
}

async function cleanup() {
  const remaining = new Set(created);
  while (remaining.size > 0) {
    let progressed = false;
    for (const id of [...remaining]) {
      const [[row]] = await pool.execute(
        'SELECT COUNT(*) AS count FROM org_units WHERE parent_id = ?',
        [id]
      );
      if (Number(row.count) > 0) continue;
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type = 'org_unit' AND entity_id = ?",
        [id]
      );
      await pool.execute('DELETE FROM org_units WHERE id = ?', [id]);
      remaining.delete(id);
      progressed = true;
    }
    if (!progressed) break;
  }
}

async function main() {
  const [[root]] = await pool.execute(
    "SELECT id FROM org_units WHERE kind = 'root' AND deleted_at IS NULL LIMIT 1"
  );
  assert.ok(root, 'No root org unit found. Run `npm run migrate` first.');

  await assertAdminOnlyManagementPermissions();
  await assertNormalizedLegacyTree(root);
  await assertHeadReportingLines(root);

  const ga = await make({ nameAr: 'إدارة اختبار', kind: 'directorate', parentId: root.id, sortOrder: 900 });
  const branch = await make({ nameAr: 'مكتب اختبار', kind: 'office', parentId: root.id, sortOrder: 901 });
  const deptA = await make({ nameAr: 'قسم أ', kind: 'section', parentId: ga.id });
  const deptB = await make({ nameAr: 'قسم ب', kind: 'section', parentId: branch.id });
  const subOffice = await make({ nameAr: 'مكتب فرعي', kind: 'office', parentId: branch.id });

  // Flat -> nested
  const tree = await org.getOrgTree({}, actor);
  const rootNode = tree.find((node) => node.id === root.id);
  const branchNode = rootNode.children.find((node) => node.id === branch.id);
  assert.ok(rootNode.children.some((node) => node.id === ga.id));
  assert.deepEqual(
    branchNode.children.map((node) => node.id).sort(),
    [deptB.id, subOffice.id].sort()
  );
  assert.equal(branchNode.depth, 1);
  assert.equal(branchNode.children.find((node) => node.id === deptB.id).depth, 2);

  // Detail path
  const detail = await org.getOrgUnit(deptB.id, actor);
  assert.deepEqual(detail.ancestors.map((unit) => unit.id), [root.id, branch.id]);
  assert.deepEqual(detail.ancestors.map((unit) => unit.depth), [0, 1]);

  // Move
  const moved = await org.moveOrgUnit(deptA.id, branch.id, actor, {});
  assert.equal(moved.parentId, branch.id);

  // Cycle + structural guards
  await expectCode(() => org.moveOrgUnit(branch.id, subOffice.id, actor, {}), 'ORG_UNIT_CYCLE');
  await expectCode(
    () => org.createOrgUnit({ nameAr: 'جذر ثان', kind: 'root', parentId: null }, actor, {}),
    'ORG_UNIT_ROOT_EXISTS'
  );
  await expectCode(
    () => org.createOrgUnit({ nameAr: 'قسم تحت قسم', kind: 'section', parentId: deptB.id }, actor, {}),
    'ORG_UNIT_PARENT_INVALID'
  );

  // Delete guard, soft delete + restore
  await expectCode(() => org.deleteOrgUnit(branch.id, actor, {}), 'ORG_UNIT_HAS_CHILDREN');
  await org.deleteOrgUnit(deptA.id, actor, {});
  const restored = await org.restoreOrgUnit(deptA.id, actor, {});
  assert.equal(restored.id, deptA.id);
  assert.equal(restored.isActive, true);

  // Scoped reads are limited to the granted subtree.
  const scoped = { id: null, isGlobal: false, scopes: [branch.id] };
  const scopedList = await org.listOrgUnits({}, scoped);
  assert.deepEqual(
    scopedList.map((unit) => unit.id).sort(),
    [branch.id, deptA.id, deptB.id, subOffice.id].sort()
  );
  const scopedTree = await org.getOrgTree({}, scoped);
  assert.deepEqual(scopedTree.map((node) => node.id), [branch.id]);
  await expectCode(() => org.getSubtree(ga.id, scoped), 'FORBIDDEN');

  // Inactive branches are pruned with their descendants, not promoted.
  await org.updateOrgUnit(branch.id, { isActive: false }, actor, {});
  const pruned = await org.getOrgTree({}, actor);
  assert.equal(pruned.some((node) => node.id === branch.id), false);
  await org.updateOrgUnit(branch.id, { isActive: true }, actor, {});

  console.log(`[org-smoke] PASS (${created.length} temporary units)`);
}

try {
  await main();
} catch (err) {
  console.error('[org-smoke] FAIL', err);
  process.exitCode = 1;
} finally {
  await cleanup().catch((err) => {
    console.error('[org-smoke] cleanup failed', err);
    process.exitCode = 1;
  });
  await pool.end();
}
