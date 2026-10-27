/**
 * Org tree smoke test (database service layer, no HTTP server needed).
 *
 *   npm run test:org --prefix backend
 *
 * Creates a disposable subtree under the existing Head, verifies the V009
 * Head reporting lines (office, deputy, sub-offices and administrations all
 * directly under u77), confirms that V012 flattened the legacy regional units,
 * exercises the tree builder, move/cycle rules, scope filtering, delete guards
 * and restore, then hard-deletes its own rows. Requires the migrations to have
 * been applied.
 */
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import * as org from '../src/modules/org/org.service.js';

const prefix = `T${Date.now().toString(36).toUpperCase()}`;
const created = [];
const actor = { id: null, isGlobal: true, scopes: [] };

// V009 legacy containers and their regional directorates. V012 must flatten
// these regions directly under the Head.
const LEGACY_GROUP_CODES = ['u35', 'u75'];
const U35_REGIONAL_CODES = ['u24', 'u25', 'u26', 'u27', 'u28', 'u29', 'u30', 'u31', 'u32', 'u33', 'u34'];
const U75_REGIONAL_CODES = [
  'u59', 'u60', 'u61', 'u62', 'u63', 'u64', 'u65', 'u66', 'u67', 'u68', 'u69', 'u70', 'u71',
  'u72', 'u73', 'u74',
];
const REGIONAL_CODES = [...U35_REGIONAL_CODES, ...U75_REGIONAL_CODES];

// V009 reporting lines: the Head office, the deputy, the five sub-offices and
// the four general administrations all report directly to the Head. Each
// administration keeps its own sections.
const HEAD_OFFICE_CODE = 'u36';
const HEAD_DEPUTY_CODE = 'u76';
const HEAD_SUB_OFFICE_CODES = ['u1', 'u2', 'u3', 'u4', 'u5'];
const HEAD_ADMINISTRATION_CODES = ['u8', 'u15', 'u19', 'u23'];
const HEAD_DIRECT_CHILD_ORDER = [
  HEAD_OFFICE_CODE,
  HEAD_DEPUTY_CODE,
  ...HEAD_SUB_OFFICE_CODES,
  ...HEAD_ADMINISTRATION_CODES,
];
const ADMINISTRATION_SECTIONS = {
  u8: ['u6', 'u7'],
  u15: ['u9', 'u10', 'u11', 'u12', 'u13', 'u14'],
  u19: ['u16', 'u17', 'u18'],
  u23: ['u20', 'u21', 'u22'],
};

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

  const sectionCodes = Object.values(ADMINISTRATION_SECTIONS).flat();
  const expectedParent = new Map();
  for (const [adminCode, codes] of Object.entries(ADMINISTRATION_SECTIONS)) {
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

  const groupIds = groups.map((group) => group.id);
  const [remainingChildren] = await pool.execute(
    `SELECT code FROM org_units
     WHERE parent_id IN (${groupIds.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
    groupIds
  );
  assert.deepEqual(
    remainingChildren.map((unit) => unit.code),
    [],
    'V012 did not flatten every regional unit out of u35/u75'
  );

  const groupChildren = await Promise.all(
    groups.map((group) => org.getChildren(group.id, actor))
  );
  for (const children of groupChildren) {
    assert.deepEqual(children, [], 'Legacy group still has children in the service tree');
  }

  const [regions] = await pool.execute(
    `SELECT id, code, parent_id, kind, sort_order, is_active FROM org_units
     WHERE code IN (${REGIONAL_CODES.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
    REGIONAL_CODES
  );
  assert.equal(regions.length, REGIONAL_CODES.length, 'Not all 27 legacy regional units were found');
  for (const region of regions) {
    assert.equal(region.parent_id, root.id, `${region.code} is not a direct child of the Head`);
    assert.equal(region.kind, 'directorate', `${region.code} should remain a directorate`);
    assert.equal(region.is_active, 1, `${region.code} should remain active`);
  }

  const baselineTree = await org.getOrgTree({}, actor);
  const baselineRoot = baselineTree.find((node) => node.id === root.id);
  assert.ok(baselineRoot, 'Root missing from the service tree');

  const rootChildren = baselineRoot.children;
  const regionalSet = new Set(REGIONAL_CODES);
  const regionsInRoot = rootChildren.filter((node) => regionalSet.has(node.code));
  assert.equal(regionsInRoot.length, REGIONAL_CODES.length, 'Not all regions are root children');

  // V012 deliberately appends regions after the existing root children and
  // preserves each group's relative order through the sort_order base.
  const firstRegionalIndex = rootChildren.findIndex((node) => regionalSet.has(node.code));
  const officeIndex = rootChildren.findIndex((node) => node.code === 'u36');
  const deputyIndex = rootChildren.findIndex((node) => node.code === 'u76');
  assert.ok(officeIndex !== -1 && deputyIndex !== -1, 'Head office/deputy root children are missing');
  assert.ok(firstRegionalIndex > officeIndex && firstRegionalIndex > deputyIndex);
  assert.deepEqual(
    rootChildren.filter((node) => U35_REGIONAL_CODES.includes(node.code)).map((node) => node.code),
    U35_REGIONAL_CODES
  );
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
