const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', '..', 'data', 'users.json');

function readUsers() {
  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n', 'utf-8');
}

function findByUsername(username) {
  if (!username) return null;
  const normalized = username.trim().toLowerCase();
  return readUsers().find((u) => u.username.toLowerCase() === normalized) || null;
}

function findById(id) {
  const numericId = Number(id);
  return readUsers().find((u) => u.id === numericId) || null;
}

/**
 * Creates a new account. `allowedContactIds` is the set of employee ids the
 * new user chose during sign-up as the only people they may contact.
 */
function createUser({ name, username, password, allowedContactIds }) {
  const users = readUsers();
  const nextId = users.reduce((max, u) => Math.max(max, u.id), 0) + 1;

  const user = {
    id: nextId,
    name: name.trim(),
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    allowedContactIds: Array.isArray(allowedContactIds) ? allowedContactIds.map(Number) : [],
  };

  users.push(user);
  writeUsers(users);
  return user;
}

function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

/** Returns a copy of the user without the password hash, safe to store in the session or render. */
function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user; // eslint-disable-line no-unused-vars
  return safe;
}

module.exports = {
  findByUsername,
  findById,
  createUser,
  verifyPassword,
  toSafeUser,
};
