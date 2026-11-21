/**
 * This machine's LAN address, for the decline link in development: the same
 * address the app finds through Metro (e.g. 192.168.50.177).
 *
 * Pure apart from the default argument: unit tested in `scripts/push-test.js`.
 */
import os from 'node:os';

const PRIVATE_LAN = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * This machine's LAN address, the same one the app finds through Metro in
 * development (e.g. 192.168.50.177). Wi-Fi first, then any private IPv4.
 */
export function pickLanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces || {})) {
    for (const item of list || []) {
      const v4 = item.family === 'IPv4' || item.family === 4;
      if (!v4 || item.internal || !PRIVATE_LAN.test(item.address)) continue;
      candidates.push({ name, address: item.address });
    }
  }
  const wifi = candidates.find((item) => /wi-?fi|wlan|wireless/i.test(item.name));
  return (wifi || candidates[0])?.address || null;
}
