import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const keysDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'keys');
fs.mkdirSync(keysDir, { recursive: true });

const privatePath = path.join(keysDir, 'jwt-private.pem');
const publicPath = path.join(keysDir, 'jwt-public.pem');

if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
  console.error('[keys] refusing to overwrite existing keys in', keysDir);
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log('[keys] wrote', privatePath);
console.log('[keys] wrote', publicPath);
console.log('[keys] keep the private key secret and out of git.');
