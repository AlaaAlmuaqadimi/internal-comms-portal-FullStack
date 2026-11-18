/**
 * One-time signalling tickets.
 *
 * A ticket lets a client open the socket without putting its JWT in the
 * handshake. It is single use and short lived. Only the SHA-256 of the ticket
 * is kept, in process memory, so this works for a single API instance only
 * (multi-instance signalling is Phase F).
 *
 * Pure: no database, socket.io or env import. The clock is injectable for
 * tests.
 */
import crypto from 'node:crypto';

function hashTicket(ticket) {
  return crypto.createHash('sha256').update(ticket).digest('base64url');
}

/**
 * @param {object} options
 * @param {number} options.ttlSeconds
 * @param {() => number} [options.now]  Milliseconds since the epoch
 * @param {number} [options.maxEntries] Hard cap on outstanding tickets
 */
export function createTicketStore({ ttlSeconds, now = Date.now, maxEntries = 10_000 } = {}) {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('createTicketStore requires a positive ttlSeconds');
  }

  const entries = new Map();

  function prune() {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
  }

  /**
   * @param {{userId: string, employeeId: string}} principal
   * @returns {{ticket: string, expiresAt: string}}
   */
  function issue(principal) {
    if (!principal?.userId || !principal?.employeeId) {
      throw new Error('A ticket needs a userId and an employeeId');
    }

    prune();
    if (entries.size >= maxEntries) {
      throw new Error('Too many outstanding signalling tickets');
    }

    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAt = now() + ttlSeconds * 1000;
    entries.set(hashTicket(ticket), {
      userId: principal.userId,
      employeeId: principal.employeeId,
      expiresAt,
    });

    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Returns the principal and deletes the ticket, or null when the ticket is
   * unknown, already used or expired.
   */
  function consume(ticket) {
    if (typeof ticket !== 'string' || ticket.length < 16 || ticket.length > 128) return null;

    const key = hashTicket(ticket);
    const entry = entries.get(key);
    if (!entry) return null;

    entries.delete(key);
    if (entry.expiresAt <= now()) return null;

    return { userId: entry.userId, employeeId: entry.employeeId };
  }

  return {
    issue,
    consume,
    prune,
    size: () => entries.size,
  };
}

export default createTicketStore;
