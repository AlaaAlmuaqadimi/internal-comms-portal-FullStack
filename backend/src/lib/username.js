/**
 * Username generation for admin-created employee accounts.
 *
 * The username is derived from the employee's English name using the common
 * corporate `first.last` pattern. Because names collide (and the form never
 * lets an admin edit the value), generation walks `first.last`, `first.last1`,
 * `first.last2`, ... until it finds a free value in `users.username`.
 *
 * The database column is `utf8mb4_unicode_ci`, so equality is case-insensitive;
 * everything here is lowercased for consistency.
 */

export const USERNAME_MAX_LENGTH = 64;
const BASE_MAX_LENGTH = 50; // leaves room for a numeric suffix
const MAX_SUFFIX = 5000;

export function slugifyNameParts(fullName) {
  return String(fullName || '')
    .normalize('NFKD')
    // Strip combining diacritics (é -> e) so Latin names transliterate cleanly.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * `Ahmed Mohammed Ali` -> `ahmed.ali`, `Ahmed` -> `ahmed`.
 * Falls back to `user` when the name has no Latin characters at all.
 */
export function baseUsernameFromEnglishName(fullName) {
  const parts = slugifyNameParts(fullName);
  if (parts.length === 0) return 'user';

  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const base = last ? `${first}.${last}` : first;

  return base.slice(0, BASE_MAX_LENGTH);
}

export function usernameCandidates(base) {
  const clean = (base || 'user').slice(0, BASE_MAX_LENGTH) || 'user';
  const candidates = [clean];
  for (let i = 1; i <= MAX_SUFFIX; i += 1) {
    candidates.push(`${clean}${i}`);
  }
  return candidates;
}

async function usernameIsTaken(executor, username, excludeUserId) {
  const [rows] = excludeUserId
    ? await executor.execute(
        'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
        [username, excludeUserId]
      )
    : await executor.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  return rows.length > 0;
}

/**
 * Returns the first free username for the supplied English name.
 *
 * `executor` is anything with `execute(sql, params)` - a pooled connection or
 * a transaction connection - so the same helper works for previews and for the
 * insert inside the creation transaction.
 */
export async function findAvailableUsername(
  executor,
  fullNameEn,
  { excludeUserId = null, base: baseOverride = null } = {}
) {
  const base = baseOverride || baseUsernameFromEnglishName(fullNameEn);

  for (const candidate of usernameCandidates(base)) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await usernameIsTaken(executor, candidate, excludeUserId))) {
      return candidate;
    }
  }

  // Practically unreachable; keeps the API deterministic if every suffix is
  // somehow occupied.
  throw new Error('Unable to allocate a unique username');
}

export { usernameIsTaken };
