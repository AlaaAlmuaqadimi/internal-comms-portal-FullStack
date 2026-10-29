/**
 * Org tree smoke test (database service layer, no HTTP server needed).
 *
 *   npm run test:org --prefix backend
 *
 * Creates a disposable subtree under the existing Head, verifies the V015
 * chart hierarchy (Head office, deputy, central directorate/office group and
 * regional group directly under u77, with every directorate and region nested
 * correctly), confirms that only the `admin` role holds management
 * permissions, exercises the tree builder, move/cycle rules, scope filtering,
 * delete guards and restore, then hard-deletes its own rows. Requires the
 * migrations to have been applied.
 */
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import * as org from '../src/modules/org/org.service.js';

const prefix = `T${Date.now().toString(36).toUpperCase()}`;
const created = [];
const actor = { id: null, isGlobal: true, scopes: [] };

// V015 chart hierarchy.
//   u77 -> u36 (head office), u76 (deputy), u78 (central group), u35 (regions)
//   u78 -> the seven directorates, the offices and their sections
//   u35 -> all 27 regional directorates
const HEAD_OFFICE_CODE = 'u36';
const HEAD_DEPUTY_CODE = 'u76';
const CENTRAL_GROUP_CODE = 'u78';
const REGIONAL_GROUP_CODE = 'u35';
const CENTRAL_GROUP_NAME = 'الادرات داخل الادارة العامه';
const HEAD_DIRECT_CHILD_ORDER = [
  HEAD_OFFICE_CODE,
  HEAD_DEPUTY_CODE,
  CENTRAL_GROUP_CODE,
  REGIONAL_GROUP_CODE,
];

// Chart order inside the central group.
const CENTRAL_CHILD_ORDER = [
  'u19', 'u23', 'u58', 'u52', 'u49', 'u15', 'u8',
  'u2', 'u38', 'u45', 'u3', 'u4', 'u5', 'u1',
];

// All 27 regional directorates, in chart order.
const U35_REGIONAL_CODES = ['u24', 'u25', 'u26', 'u27', 'u28', 'u29', 'u30', 'u31', 'u32', 'u33', 'u34'];
const U75_REGIONAL_CODES = [
  'u59', 'u60', 'u61', 'u62', 'u63', 'u64', 'u65', 'u66', 'u67', 'u68', 'u69', 'u70', 'u71',
  'u72', 'u73', 'u74',
];
const REGIONAL_CODES = [...U35_REGIONAL_CODES, ...U75_REGIONAL_CODES];

const ADMINISTRATION_SECTIONS = {
  u8: ['u6', 'u7'],
  u15: ['u9', 'u10', 'u13', 'u12', 'u11', 'u14'],
  u19: ['u16', 'u17', 'u18'],
  u23: ['u20', 'u21', 'u79', 'u22'],
};
const DIRECTORATE_SECTIONS = {
  u49: ['u46', 'u47', 'u48'],
  u52: ['u50', 'u51'],
  u58: ['u53', 'u54', 'u55', 'u56', 'u57'],
  u45: ['u40', 'u41', 'u43', 'u44', 'u42', 'u39'],
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

  // Only the deputy's own office remains under the Deputy Head. The legacy
  // administrative section (u39) belongs to the legal affairs office.
  const [deputyChildren] = await pool.execute(
    `SELECT child.code
     FROM org_units child
     JOIN org_units parent ON parent.id = child.parent_id
     WHERE parent.code = ? AND child.deleted_at IS NULL AND child.is_active = 1
     ORDER BY child.sort_order, child.code`,
    [HEAD_DEPUTY_CODE]
  );
  assert.deepEqual(
    deputyChildren.map((unit) => unit.code),
    ['u37'],
    'Only the deputy office (u37) should remain under the Deputy Head'
  );

  // The central group holds the general directorates and the offices.
  const [[central]] = await pool.execute(
    'SELECT id, parent_id, kind, name_ar, is_active FROM org_units WHERE code = ?',
    [CENTRAL_GROUP_CODE]
  );
  assert.ok(central, 'The central group is missing');
  assert.equal(central.parent_id, root.id, 'The central group must report to the Head');
  assert.equal(central.kind, 'group', 'The central group must be a group');
  assert.equal(Number(central.is_active), 1, 'The central group must be active');
  assert.equal(central.name_ar, CENTRAL_GROUP_NAME, 'The central group name changed');

  const [centralChildren] = await pool.execute(
    `SELECT code, parent_id, kind FROM org_units
     WHERE parent_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, code`,
    [central.id]
  );
  assert.deepEqual(
    centralChildren.map((unit) => unit.code),
    CENTRAL_CHILD_ORDER,
    'Central group children are not in the chart order'
  );
  for (const child of centralChildren) {
    assert.equal(child.parent_id, central.id, `${child.code} must be under the central group`);
    assert.ok(
      ['directorate', 'office'].includes(child.kind),
      `${child.code} has an unexpected kind`
    );
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

  // Every administration lists its sections in the expected order.
  const [ordered] = await pool.execute(
    `SELECT child.code, parent.code AS parent_code
     FROM org_units child
     JOIN org_units parent ON parent.id = child.parent_id
     WHERE parent.code IN (${Object.keys(allSections).map(() => '?').join(', ')})
       AND child.deleted_at IS NULL
     ORDER BY parent.code, child.sort_order, child.code`,
    Object.keys(allSections)
  );
  const byParent = new Map();
  for (const row of ordered) {
    if (!byParent.has(row.parent_code)) byParent.set(row.parent_code, []);
    byParent.get(row.parent_code).push(row.code);
  }
  for (const [adminCode, codes] of Object.entries(allSections)) {
    assert.deepEqual(
      byParent.get(adminCode) ?? [],
      codes,
      `${adminCode} sections are not in the expected order`
    );
  }

  // Spot-check section names that were corrected to match the printed chart.
  const names = new Map();
  const [named] = await pool.execute(
    `SELECT code, name_ar FROM org_units
     WHERE code IN ('u14', 'u21', 'u79') AND deleted_at IS NULL`
  );
  for (const child of named) names.set(child.code, child.name_ar);
  assert.equal(names.get('u14'), 'قسم المخازن', 'u14 must be the stores section');
  assert.equal(names.get('u21'), 'قسم الإحصاء', 'u21 must be the statistics section');
  assert.equal(names.get('u79'), 'قسم مطابقة الحسابات', 'u79 must be the reconciliation section');
}

async function assertRegionalHierarchy(root) {
  const [[u35]] = await pool.execute(
    'SELECT id, parent_id, kind, is_active FROM org_units WHERE code = ?',
    [REGIONAL_GROUP_CODE]
  );
  assert.ok(u35, 'The regional group is missing');
  assert.equal(u35.parent_id, root.id, 'The regional group must report to the Head');
  assert.equal(u35.kind, 'group', 'The regional group must be a group');

  const [children] = await pool.execute(
    `SELECT code, parent_id, kind, is_active FROM org_units
     WHERE parent_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, code`,
    [u35.id]
  );
  assert.deepEqual(
    children.map((unit) => unit.code),
    REGIONAL_CODES,
    'All 27 regional directorates must sit under the regional group in chart order'
  );
  for (const child of children) {
    assert.equal(child.parent_id, u35.id, `${child.code} must stay under the regional group`);
    assert.equal(child.kind, 'directorate', `${child.code} should remain a directorate`);
    assert.equal(child.is_active, 1, `${child.code} should remain active`);
  }

  // The old deputy-level regional container is empty and hidden.
  const [[u75]] = await pool.execute(
    'SELECT id, is_active FROM org_units WHERE code = ?',
    ['u75']
  );
  assert.ok(u75, 'The legacy u75 container is missing');
  assert.equal(Number(u75.is_active), 0, 'The legacy u75 container must be inactive');
  const [u75Children] = await pool.execute(
    'SELECT code FROM org_units WHERE parent_id = ? AND deleted_at IS NULL',
    [u75.id]
  );
  assert.deepEqual(u75Children.map((unit) => unit.code), [], 'u75 must have no children');
  assert.deepEqual(
    await org.getChildren(u75.id, actor),
    [],
    'Legacy u75 group still has children in the service tree'
  );
}

async function assertTreeShape(root) {
  const tree = await org.getOrgTree({}, actor);
  const rootNode = tree.find((node) => node.id === root.id);
  assert.ok(rootNode, 'Root missing from the service tree');

  assert.deepEqual(
    rootNode.children.map((node) => node.code),
    HEAD_DIRECT_CHILD_ORDER,
    'Head-level children are not in the expected order'
  );

  const centralNode = rootNode.children.find((node) => node.code === CENTRAL_GROUP_CODE);
  assert.ok(centralNode, 'Central group missing from the service tree');
  assert.deepEqual(
    centralNode.children.map((node) => node.code),
    CENTRAL_CHILD_ORDER,
    'Central group children are not in the chart order'
  );

  const regionalNode = rootNode.children.find((node) => node.code === REGIONAL_GROUP_CODE);
  assert.ok(regionalNode, 'Regional group missing from the service tree');
  assert.deepEqual(
    regionalNode.children.map((node) => node.code),
    REGIONAL_CODES,
    'Regional directorates are not in the chart order'
  );
  assert.ok(
    regionalNode.children.every((node) => node.depth === 2),
    'Regional directorates should be at depth 2'
  );

  assert.ok(
    !rootNode.children.some((node) => REGIONAL_CODES.includes(node.code)),
    'A regional directorate must not be promoted to a Head-level child'
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
  await assertHeadReportingLines(root);
  await assertRegionalHierarchy(root);
  await assertTreeShape(root);

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
