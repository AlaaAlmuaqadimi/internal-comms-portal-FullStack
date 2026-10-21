import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(claims) {
  return jwt.sign(claims, env.jwt.privateKey, {
    algorithm: 'RS256',
    expiresIn: env.jwt.accessTokenTtl,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.publicKey, {
    algorithms: ['RS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

export function accessTokenTtlSeconds() {
  const decoded = jwt.decode(
    jwt.sign({}, env.jwt.privateKey, {
      algorithm: 'RS256',
      expiresIn: env.jwt.accessTokenTtl,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    })
  );
  return decoded.exp - decoded.iat;
}

// ---- Opaque refresh tokens ------------------------------------------------

export function generateRefreshToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

export function newRefreshFamilyId() {
  return crypto.randomUUID();
}

export function newRefreshTokenId() {
  return crypto.randomUUID();
}

export function refreshTokenExpiry() {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}
