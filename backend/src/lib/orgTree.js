/**
 * O(n) flat-to-nested builder for the org_units adjacency list.
 *
 * The database returns a flat, already-mapped list. This module never queries
 * the database, which keeps it usable from the API, workers and tests.
 */

function compareUnits(a, b) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = String(a.nameAr || '').localeCompare(String(b.nameAr || ''), 'ar');
  if (byName !== 0) return byName;
  return String(a.code || '').localeCompare(String(b.code || ''));
}

/**
 * Turns flat units into a forest. Nodes whose parent is outside the supplied
 * set (for example a scoped query) become roots of their own tree, so callers
 * never lose rows silently.
 *
 * @param {Array<object>} units units with `id`, `parentId`, `sortOrder`, `nameAr`, `code`
 * @returns {Array<object>} roots, each with `children` and `depth`
 */
export function buildOrgTree(units) {
  const byId = new Map();
  for (const unit of units) {
    byId.set(unit.id, { ...unit, children: [] });
  }

  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const visit = (nodes, depth) => {
    nodes.sort(compareUnits);
    for (const node of nodes) {
      node.depth = depth;
      visit(node.children, depth + 1);
    }
  };
  visit(roots, 0);

  return roots;
}

/**
 * Drops inactive nodes *and their descendants*. This is deliberately a prune,
 * not a flat filter: an active child under an inactive administration must not
 * float to the top of the tree.
 */
export function pruneInactive(nodes) {
  const result = [];
  for (const node of nodes) {
    if (!node.isActive) continue;
    result.push({ ...node, children: pruneInactive(node.children) });
  }
  return result;
}

/**
 * Depth-first flatten of a built tree (useful for exporting a stable order).
 */
export function flattenOrgTree(nodes) {
  const out = [];
  const visit = (list) => {
    for (const node of list) {
      const { children, ...unit } = node;
      out.push(unit);
      visit(children);
    }
  };
  visit(nodes);
  return out;
}
