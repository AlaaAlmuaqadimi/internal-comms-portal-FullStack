// Identity matcher shared by the recipient picker, the sender checks and the
// read-receipt directory. The same person arrives in two shapes, and the
// backend (auth.service publicUser / employee.service mapEmployee) uses two
// different tables for their ids:
//
//   session user:  { id: users.id,     employeeId: employees.id, username, name, nameEn }
//   employee row:  { id: employees.id, employeeId: employees.id, userId: users.id,
//                    username, fullNameAr, fullNameEn }
//
// Both tables auto-increment from 1, so `user.id` (an account id) must NOT be
// compared with `employee.id` (an employee id): account #7 and employee #7 are
// usually two different people, and a blind any-id-to-any-id match would hide
// the wrong colleague from the recipient list. Ids are therefore compared by
// kind when the objects say which kind they carry, and the generic
// any-id-to-any-id comparison is only used when the kinds are unknown (sample
// data, older stored objects).
//
// Order: ids (authoritative) -> username (case-insensitive) -> normalised full
// name (last fallback, only when no id could be compared).

const ID_KEYS = ['id', 'employeeId', 'employee_id', 'userId', 'user_id'];

const toText = (value) =>
  value === undefined || value === null ? '' : String(value).trim();

const pick = (person, keys) =>
  keys.map((key) => toText(person?.[key])).filter(Boolean);

const overlaps = (a, b) => a.some((value) => b.includes(value));

// A session profile carries `employeeId` next to its own `id`; there `id` is
// the account id.
const looksLikeSession = (person) =>
  !!toText(person?.employeeId || person?.employee_id) &&
  !toText(person?.userId || person?.user_id);

// Employee rows carry `userId` (the linked account) next to their own `id`;
// there `id` is the employee id.
const looksLikeEmployeeRow = (person) =>
  !!toText(person?.userId || person?.user_id);

// Employee ids (employees.id) and account ids (users.id) of one object.
const typedIds = (person) => {
  if (looksLikeSession(person)) {
    return {
      employee: pick(person, ['employeeId', 'employee_id']),
      account: pick(person, ['id', 'userId', 'user_id']),
    };
  }
  if (looksLikeEmployeeRow(person)) {
    return {
      employee: pick(person, ['id', 'employeeId', 'employee_id']),
      account: pick(person, ['userId', 'user_id']),
    };
  }
  return null;
};

const normalizeUsername = (value) => toText(value).toLowerCase();

// Arabic diacritics (harakat, Quranic marks) and tatweel are optional writing
// decorations; they must not decide whether two names identify the same person.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

export const normalizeEmployeeName = (value) => {
  const text = toText(value);
  if (!text) return '';
  return text
    .replace(ARABIC_MARKS, '')
    .replace(TATWEEL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const nameValues = (person) => {
  if (!person || typeof person !== 'object') return [];

  const raw = [
    typeof person.name === 'string' ? person.name : '',
    person.nameAr,
    person.nameEn,
    person.fullNameAr,
    person.full_name_ar,
    person.fullNameEn,
    person.full_name_en,
    person.name_ar,
    person.name_en,
  ];

  // `name` can itself be a { ar, en } object in some payloads.
  if (person.name && typeof person.name === 'object') {
    raw.push(person.name.ar, person.name.en);
  }

  return raw.map(normalizeEmployeeName).filter(Boolean);
};

/**
 * True when `employee` is the same person as the signed-in `user`.
 * Comparisons use trimmed strings so numeric and textual ids both work.
 */
export const isSameEmployee = (user, employee) => {
  if (!user || !employee) return false;
  if (typeof user !== 'object' || typeof employee !== 'object') return false;

  // 1. Ids. Compared by kind when both objects say which kind they carry.
  let idCompared = false;
  const userTyped = typedIds(user);
  const employeeTyped = typedIds(employee);

  if (userTyped && employeeTyped) {
    if (userTyped.employee.length && employeeTyped.employee.length) {
      idCompared = true;
      if (overlaps(userTyped.employee, employeeTyped.employee)) return true;
    }
    if (userTyped.account.length && employeeTyped.account.length) {
      idCompared = true;
      if (overlaps(userTyped.account, employeeTyped.account)) return true;
    }
  } else {
    // Kinds unknown on at least one side: any id field against any id field.
    const userIds = pick(user, ID_KEYS);
    const employeeIds = pick(employee, ID_KEYS);
    if (userIds.length && employeeIds.length) {
      idCompared = true;
      if (overlaps(userIds, employeeIds)) return true;
    }
  }

  // 2. Username, case-insensitive (unique per account).
  const userUsername = normalizeUsername(user.username);
  const employeeUsername = normalizeUsername(employee.username);
  if (userUsername && employeeUsername) {
    if (userUsername === employeeUsername) return true;
    idCompared = true;
  }

  // 3. Last fallback only: the normalised full name, Arabic or English on
  // either side. Skipped when ids/usernames were available and disagreed, so
  // two colleagues who share a name are not confused.
  if (idCompared) return false;
  const userNames = nameValues(user);
  const employeeNames = nameValues(employee);
  return overlaps(userNames, employeeNames);
};

/**
 * True when the signed-in `user` published a notification whose stored
 * `createdBy` is given. New notifications store the sender with both id kinds
 * (`employeeId`, `userId`) and the username; older ones only have
 * `{ id, name }`, where `id` is the sender's viewer id (employeeId || id).
 * The name is never used here: a recipient who shares the sender's name must
 * not see the read receipts.
 */
export const isNotificationSender = (user, createdBy) => {
  if (!user || !createdBy || typeof createdBy !== 'object') return false;

  const userEmployeeId = toText(user.employeeId || user.employee_id);
  const userAccountId = toText(user.id || user.userId || user.user_id);
  const senderEmployeeId = toText(createdBy.employeeId);
  const senderAccountId = toText(createdBy.userId);

  if (userEmployeeId && senderEmployeeId) {
    return userEmployeeId === senderEmployeeId;
  }
  if (userAccountId && senderAccountId) {
    return userAccountId === senderAccountId;
  }

  const userUsername = normalizeUsername(user.username);
  const senderUsername = normalizeUsername(createdBy.username);
  if (userUsername && senderUsername) return userUsername === senderUsername;

  // Legacy `{ id }`: the sender's viewer id, same rule as notificationAlerts.
  const viewerId = userEmployeeId || userAccountId;
  return !!viewerId && toText(createdBy.id) === viewerId;
};

export default isSameEmployee;
