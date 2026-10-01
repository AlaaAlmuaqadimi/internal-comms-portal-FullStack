const crypto = require('crypto');
const { readJson, writeJson } = require('./dataService');
const org = require('./orgService');

const KEY_LEN = 64;
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');

const getSeedAccounts = () => readJson('accounts.json');
const getUsers = () => readJson('users.json');
const getKitchens = () => readJson('kitchens.json');

/** Public profile: never includes credentials or the permission list. */
function toProfile(a) {
  return {
    id: a.id,
    name: a.name,
    unitId: a.unitId || '',
    ...org.describe(a.unitId),
    status: a.status || 'offline',
    isKitchen: false,
    avatar: a.avatar || '',
    avatarAlt: a.avatarAlt || '',
  };
}

function kitchenProfile(k) {
  return {
    id: k.id,
    name: k.name,
    unitId: '',
    unitName: '',
    management: '',
    section: '',
    path: k.scope || '',
    status: 'service',
    isKitchen: true,
    avatar: '',
    avatarAlt: '',
  };
}

/** Every human account that exists: seeded employees + registered users. */
function getAllProfiles() {
  return [...getSeedAccounts(), ...getUsers()].map(toProfile);
}

const findProfile = (id) => getAllProfiles().find((p) => p.id === Number(id)) || null;
const findUserById = (id) => getUsers().find((u) => u.id === Number(id)) || null;
const findUserByUsername = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return getUsers().find((u) => u.username === n) || null;
};

/** Any account (human) currently placed at this unit or below it — used before deleting a unit. */
function hasAccountAtOrBelow(unitId) {
  const chain = new Set([unitId]);
  return [...getSeedAccounts(), ...getUsers()].some((a) => chain.has(a.unitId));
}

const derive = (password, salt) => crypto.scryptSync(password, salt, KEY_LEN);

function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = derive(password, user.passwordSalt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Spend the same time as a real check so unknown usernames aren't distinguishable. */
function burnVerify(password) {
  derive(password, DUMMY_SALT);
}

function nextId() {
  return Math.max(0, ...getSeedAccounts().map((a) => a.id), ...getUsers().map((u) => u.id)) + 1;
}

function createUser(data) {
  const users = getUsers();
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: nextId(),
    username: data.username.toLowerCase(),
    passwordSalt: salt,
    passwordHash: derive(data.password, salt).toString('hex'),
    name: data.name,
    unitId: data.unitId,
    status: 'online',
    avatar: '',
    avatarAlt: '',
    allowedContacts: data.allowedContacts,
    kitchenChoice: data.kitchenChoice || null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJson('users.json', users);
  return user;
}

function setStatus(id, status) {
  const users = getUsers();
  const user = users.find((u) => u.id === Number(id));
  if (user) {
    user.status = status;
    writeJson('users.json', users);
  }
}

const RELATION_ORDER = [
  ['manager', 'المرتبة الأعلى بدرجة واحدة (مديرك المباشر)'],
  ['same', 'نفس المستوى الإداري (زملاؤك ونظراؤك)'],
  ['below', 'الحسابات التي تندرج أسفل وحدتك'],
];

/**
 * Human accounts a person placed in `unitId` may be allowed to contact, according to
 * the hierarchy: their manager (one rank up), the same administrative level, or
 * anyone below them. See orgService.relatives() for the exact rule per unit kind.
 */
function getCandidates(unitId, excludeId = null) {
  if (!org.isSelectable(unitId)) return [];
  const rel = org.relatives(unitId);
  const out = [];
  getAllProfiles().forEach((p) => {
    if (p.id === excludeId) return;
    let relation = null;
    if (rel.same.has(p.unitId)) relation = 'same';
    else if (rel.below.has(p.unitId)) relation = 'below';
    else if (rel.manager.has(p.unitId)) relation = 'manager';
    if (relation) out.push({ ...p, relation });
  });
  return out;
}

function groupByRelation(candidates) {
  return RELATION_ORDER.map(([key, label]) => ({ key, label, items: candidates.filter((c) => c.relation === key) })).filter((g) => g.items.length);
}

const parseIds = (value) => [...new Set([].concat(value || []).map(Number))].filter(Number.isInteger);

function setAllowedContacts(id, ids) {
  const users = getUsers();
  const user = users.find((u) => u.id === Number(id));
  if (user) {
    user.allowedContacts = ids;
    writeJson('users.json', users);
  }
}

const SHARED_KITCHEN_NAME = 'مطبخ 1 / مطبخ 2';

/**
 * What kitchen(s) apply to a unit's position in the hierarchy:
 *  - 'none':  no kitchen tag found anywhere above this unit
 *  - 'fixed': exactly one kitchen serves it (regional directorates) — not a choice
 *  - 'choice': it falls under the two shared kitchens — the account holder picks one
 */
function getKitchenOptionsForUnit(unitId) {
  const kitchenName = org.kitchenNameFor(unitId);
  if (!kitchenName) return { type: 'none' };
  if (kitchenName === SHARED_KITCHEN_NAME) {
    const options = getKitchens().filter((k) => k.id === 'k-shared-1' || k.id === 'k-shared-2').map(kitchenProfile);
    return { type: 'choice', options };
  }
  const match = getKitchens().find((k) => k.name === kitchenName);
  return match ? { type: 'fixed', kitchen: kitchenProfile(match) } : { type: 'none' };
}

const isValidKitchenChoice = (unitId, id) => {
  const opts = getKitchenOptionsForUnit(unitId);
  return opts.type === 'choice' && opts.options.some((o) => o.id === id);
};

/** The kitchen(s) actually linked to this user right now (their pick, or the fixed one). */
function getKitchensForUnit(unitId, chosenId = null) {
  const opts = getKitchenOptionsForUnit(unitId);
  if (opts.type === 'none') return [];
  if (opts.type === 'fixed') return [opts.kitchen];
  const chosen = opts.options.find((o) => o.id === chosenId) || opts.options[0];
  return [chosen];
}

function setKitchenChoice(userId, kitchenId) {
  const users = getUsers();
  const user = users.find((u) => u.id === Number(userId));
  if (user && isValidKitchenChoice(user.unitId, kitchenId)) {
    user.kitchenChoice = kitchenId;
    writeJson('users.json', users);
    return true;
  }
  return false;
}

/** The ONLY human accounts this user may see and contact: chosen AND currently allowed by the hierarchy. */
function getContactsFor(user) {
  const allowed = new Set(user.allowedContacts || []);
  return getCandidates(user.unitId, user.id).filter((c) => allowed.has(c.id));
}

const getKitchensFor = (user) => getKitchensForUnit(user.unitId, user.kitchenChoice);

/** Every contactable entity for this user: people they chose + kitchens linked automatically. */
const getAllContactsFor = (user) => [...getContactsFor(user), ...getKitchensFor(user)];

const canContact = (user, id) => getAllContactsFor(user).some((p) => String(p.id) === String(id));
const findContact = (user, id) => getAllContactsFor(user).find((p) => String(p.id) === String(id)) || null;

module.exports = {
  toProfile,
  getAllProfiles,
  findProfile,
  findUserById,
  findUserByUsername,
  hasAccountAtOrBelow,
  verifyPassword,
  burnVerify,
  createUser,
  setStatus,
  getCandidates,
  groupByRelation,
  parseIds,
  setAllowedContacts,
  getKitchenOptionsForUnit,
  isValidKitchenChoice,
  setKitchenChoice,
  getKitchensForUnit,
  getContactsFor,
  getKitchensFor,
  getAllContactsFor,
  canContact,
  findContact,
};
