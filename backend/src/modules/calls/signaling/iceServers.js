/**
 * ICE server list returned with a signalling ticket.
 *
 * TURN credentials use the coturn "REST API" scheme (`use-auth-secret`):
 *   username   = "<unix expiry>:<random id>"
 *   credential = base64(HMAC-SHA1(sharedSecret, username))
 *
 * The username deliberately contains a random id and not the employee id, so
 * the TURN server's logs cannot tie a relayed session to a person.
 *
 * Pure: no env import. The caller passes the configuration.
 */
import crypto from 'node:crypto';

/**
 * @param {object} config
 * @param {string[]} [config.stunUrls]
 * @param {string[]} [config.turnUrls]
 * @param {string}   [config.turnSharedSecret]
 * @param {number}   [config.turnCredentialTtlSeconds]
 * @param {() => number} [config.now] Milliseconds since the epoch
 * @returns {Array<{urls: string[], username?: string, credential?: string}>}
 */
export function buildIceServers({
  stunUrls = [],
  turnUrls = [],
  turnSharedSecret = '',
  turnCredentialTtlSeconds = 3600,
  now = Date.now,
} = {}) {
  const servers = [];

  if (stunUrls.length > 0) {
    servers.push({ urls: [...stunUrls] });
  }

  if (turnUrls.length > 0 && turnSharedSecret) {
    const expiry = Math.floor(now() / 1000) + turnCredentialTtlSeconds;
    const username = `${expiry}:${crypto.randomBytes(8).toString('hex')}`;
    const credential = crypto
      .createHmac('sha1', turnSharedSecret)
      .update(username)
      .digest('base64');
    servers.push({ urls: [...turnUrls], username, credential });
  }

  return servers;
}

/** True when at least one TURN server with credentials is configured. */
export function hasTurn(iceServers) {
  return iceServers.some(
    (server) =>
      server.credential &&
      server.urls.some((url) => /^turns?:/i.test(url))
  );
}

export default buildIceServers;
