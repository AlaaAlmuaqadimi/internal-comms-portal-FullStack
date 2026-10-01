const { readJson, writeJson } = require('./dataService');

/**
 * Organisational hierarchy, loaded from data/org.json and editable from the app
 * (see /org). Node kinds: root | deputy | office | directorate | section | group.
 * "group" nodes are pure visual categories (e.g. "regional directorates branch"):
 * nobody sits in them, and they are skipped when computing a unit's manager/path.
 */
let root;
let byId;

function index() {
  root = readJson('org.json');
  byId = new Map();
  (function walk(node, parent) {
    node.parent = parent ? parent.id : null;
    node.children = node.children || [];
    byId.set(node.id, node);
    node.children.forEach((child) => walk(child, node));
  })(root, null);
}
index();

const get = (id) => byId.get(String(id)) || null;
const isGroup = (n) => n.kind === 'group';
const isSelectable = (id) => {
  const n = get(id);
  return !!n && !isGroup(n);
};

function ancestors(id) {
  const chain = [];
  for (let n = get(id); n; n = n.parent ? get(n.parent) : null) chain.unshift(n);
  return chain;
}

function managementOf(id) {
  const chain = ancestors(id).reverse();
  return chain.find((n) => ['root', 'deputy', 'office', 'directorate'].includes(n.kind)) || chain[0];
}

function describe(id) {
  const n = get(id);
  if (!n) return { unitName: '', management: '', section: '', path: '', kitchen: '' };
  return {
    unitName: n.name,
    management: managementOf(id).name,
    section: n.kind === 'section' ? n.name : '',
    path: ancestors(id).filter((a) => !isGroup(a)).map((a) => a.name).join(' › '),
    kitchen: kitchenNameFor(id),
  };
}

function descendantIds(node) {
  return node.children.flatMap((c) => [c.id, ...descendantIds(c)]);
}

/** Direct manager unit = nearest non-group ancestor. */
function managerUnit(id) {
  const chain = ancestors(id);
  for (let i = chain.length - 2; i >= 0; i--) if (!isGroup(chain[i])) return chain[i];
  return null;
}

const allOfKind = (kind) => [...byId.values()].filter((n) => n.kind === kind);

/**
 * Units related to `id`, used to decide who can be offered as a contact:
 *  - below:   every unit underneath it (any depth)
 *  - same:    units at the same administrative rank
 *  - manager: the unit(s) directly above in authority
 *
 * Directorates (إدارة) are a special case per the agency's structure: a directorate
 * head reports to top leadership one rank up — the head of the agency and their
 * deputy — regardless of which office branch the directorate happens to be nested
 * under in the chart, and is a peer of every other directorate (general, technical,
 * or regional) rather than only the ones drawn in the same branch.
 */
function relatives(id) {
  const node = get(id);
  if (node.kind === 'directorate') {
    const same = new Set(allOfKind('directorate').map((d) => d.id));
    const manager = new Set([...allOfKind('root'), ...allOfKind('deputy')].map((d) => d.id));
    return { below: new Set(descendantIds(node)), same, manager };
  }
  const same = new Set([node.id]);
  if (node.parent) get(node.parent).children.forEach((c) => same.add(c.id));
  const manager = managerUnit(id);
  return { below: new Set(descendantIds(node)), same, manager: new Set(manager ? [manager.id] : []) };
}

/** Nearest kitchen tag found on this unit or an ancestor (kitchens are inherited down the tree). */
function kitchenNameFor(id) {
  for (let n = get(id); n; n = n.parent ? get(n.parent) : null) if (n.kitchen) return n.kitchen;
  return null;
}

/** Grouped options for the <select> shown when creating an account. */
function unitOptions() {
  const nbsp = '\u00A0\u00A0';
  const walk = (node, depth, out) => {
    out.push({ id: node.id, label: nbsp.repeat(depth) + node.name });
    node.children.filter((c) => !isGroup(c)).forEach((c) => walk(c, depth + 1, out));
  };
  const top = [];
  walk(root, 0, top);
  const groups = [{ label: 'الهيكل الإداري', items: top }];
  const visitGroups = (node) => {
    node.children.forEach((c) => {
      if (isGroup(c)) {
        const items = [];
        c.children.forEach((cc) => walk(cc, 0, items));
        if (items.length) groups.push({ label: `${node.name} — ${c.name}`, items });
      } else visitGroups(c);
    });
  };
  visitGroups(root);
  return groups;
}

/* ---------------------------- editable chart (used by /org) ---------------------------- */

const KINDS = ['office', 'directorate', 'section'];

function tree() {
  return root;
}

function nextId() {
  let max = 0;
  byId.forEach((n) => {
    const m = /^u(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `u${max + 1}`;
}

function persist() {
  writeJson('org.json', root);
}

function addUnit({ parentId, name, kind, kitchen }) {
  const parent = get(parentId);
  if (!parent) throw Object.assign(new Error('الوحدة الأصل غير موجودة.'), { status: 400 });
  if (!KINDS.includes(kind)) throw Object.assign(new Error('نوع الوحدة غير صالح.'), { status: 400 });
  if (!name || !name.trim()) throw Object.assign(new Error('اسم الوحدة مطلوب.'), { status: 400 });
  const node = { id: nextId(), name: name.trim(), kind, children: [] };
  if (kitchen && kitchen.trim()) node.kitchen = kitchen.trim();
  parent.children.push(node);
  persist();
  index();
  return node.id;
}

function renameUnit(id, name) {
  const n = get(id);
  if (!n) throw Object.assign(new Error('الوحدة غير موجودة.'), { status: 404 });
  if (isGroup(n) || n.kind === 'root') throw Object.assign(new Error('لا يمكن تعديل هذه الوحدة من هنا.'), { status: 400 });
  if (!name || !name.trim()) throw Object.assign(new Error('اسم الوحدة مطلوب.'), { status: 400 });
  n.name = name.trim();
  persist();
  index();
}

function setKitchen(id, kitchen) {
  const n = get(id);
  if (!n) throw Object.assign(new Error('الوحدة غير موجودة.'), { status: 404 });
  if (kitchen && kitchen.trim()) n.kitchen = kitchen.trim();
  else delete n.kitchen;
  persist();
  index();
}

/** Every account (seed employee, registered user, or anything reusing this id space) sitting at or below a unit. */
function unitsInUse(id, hasAccountFn) {
  return [id, ...descendantIds(get(id))].some(hasAccountFn);
}

function removeUnit(id, hasAccountFn) {
  const n = get(id);
  if (!n) throw Object.assign(new Error('الوحدة غير موجودة.'), { status: 404 });
  if (n.kind === 'root' || isGroup(n)) throw Object.assign(new Error('لا يمكن حذف هذه الوحدة.'), { status: 400 });
  if (unitsInUse(id, hasAccountFn)) {
    throw Object.assign(new Error('لا يمكن حذف هذه الوحدة أو الوحدات التابعة لها لوجود حسابات مرتبطة بها. انقل الحسابات أولًا.'), { status: 409 });
  }
  const parent = get(n.parent);
  parent.children = parent.children.filter((c) => c.id !== id);
  persist();
  index();
}

module.exports = {
  get, isSelectable, describe, relatives, kitchenNameFor, unitOptions,
  tree, addUnit, renameUnit, setKitchen, removeUnit, KINDS,
};
