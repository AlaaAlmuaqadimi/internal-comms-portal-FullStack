import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

function readKey(inlineValue, fileValue, label) {
  if (inlineValue && inlineValue.trim() !== '') {
    return inlineValue.replace(/\\n/g, '\n');
  }
  if (fileValue && fileValue.trim() !== '') {
    const resolved = path.isAbsolute(fileValue)
      ? fileValue
      : path.resolve(backendRoot, fileValue);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config: ${label} file not found at ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf8');
  }
  return null;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default(''),
  LOG_FORMAT: z.string().default('dev'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('internal_comms'),
  DB_USER: z.string().default('app_rw'),
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  JWT_PRIVATE_KEY: z.string().optional().default(''),
  JWT_PUBLIC_KEY: z.string().optional().default(''),
  JWT_PRIVATE_KEY_PATH: z.string().optional().default(''),
  JWT_PUBLIC_KEY_PATH: z.string().optional().default(''),
  JWT_ISSUER: z.string().default('internal-comms-portal'),
  JWT_AUDIENCE: z.string().default('internal-comms-portal-app'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  ARGON2_MEMORY_KIB: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  LOGIN_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  // Token refresh has its own, larger budget: with a 15-minute access token
  // every signed-in device refreshes about 4 times an hour, and a whole office
  // can share one public IP. Same window as the login limiter.
  REFRESH_RATE_MAX: z.coerce.number().int().positive().default(300),

  CALL_INVITE_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(1),
  CALL_INVITE_RATE_MAX: z.coerce.number().int().positive().default(10),

  // Phase B signalling. The feature flag defaults to off so REST history keeps
  // working even when the socket build has not shipped yet.
  CALL_SIGNALING_ENABLED: z.string().optional().default('false'),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(45),
  CALL_DISCONNECT_GRACE_SECONDS: z.coerce.number().int().positive().default(30),
  SIGNALING_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  SIGNALING_TICKET_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(1),
  SIGNALING_TICKET_RATE_MAX: z.coerce.number().int().positive().default(30),

  // ICE servers handed to clients with each signalling ticket. Leadership
  // calls are relay-only, so they cannot connect until TURN is configured.
  STUN_URLS: z.string().default(''),
  TURN_URLS: z.string().default(''),
  TURN_SHARED_SECRET: z.string().default(''),
  // Fixed credentials for a hosted TURN service (used when no shared secret).
  TURN_USERNAME: z.string().default(''),
  TURN_CREDENTIAL: z.string().default(''),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Phase D: incoming-call pushes through Firebase Cloud Messaging.
  PUSH_ENABLED: z.string().optional().default('false'),
  // Firebase service-account JSON (secret, server only; backend/secrets/ is git-ignored).
  FCM_SERVICE_ACCOUNT_FILE: z.string().default('./secrets/firebase-service-account.json'),
  // Put the caller's (possibly redacted) name in the push. Off: Google sees only the call id.
  PUSH_SHOW_CALLER_NAME: z.string().optional().default('false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

const raw = parsed.data;

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const jwtPrivateKey = readKey(raw.JWT_PRIVATE_KEY, raw.JWT_PRIVATE_KEY_PATH, 'JWT_PRIVATE_KEY');
const jwtPublicKey = readKey(raw.JWT_PUBLIC_KEY, raw.JWT_PUBLIC_KEY_PATH, 'JWT_PUBLIC_KEY');

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  port: raw.PORT,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logFormat: raw.LOG_FORMAT,

  db: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    database: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    connectionLimit: raw.DB_CONNECTION_LIMIT,
  },

  jwt: {
    privateKey: jwtPrivateKey,
    publicKey: jwtPublicKey,
    issuer: raw.JWT_ISSUER,
    audience: raw.JWT_AUDIENCE,
    accessTokenTtl: raw.ACCESS_TOKEN_TTL,
  },

  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,

  lockout: {
    maxFailedLogins: raw.MAX_FAILED_LOGINS,
    lockMinutes: raw.ACCOUNT_LOCK_MINUTES,
  },

  argon2: {
    memoryCost: raw.ARGON2_MEMORY_KIB,
    timeCost: raw.ARGON2_TIME_COST,
    parallelism: raw.ARGON2_PARALLELISM,
  },

  loginRateLimit: {
    windowMs: raw.LOGIN_RATE_WINDOW_MINUTES * 60 * 1000,
    max: raw.LOGIN_RATE_MAX,
    refreshMax: raw.REFRESH_RATE_MAX,
  },

  callInviteRateLimit: {
    windowMs: raw.CALL_INVITE_RATE_WINDOW_MINUTES * 60 * 1000,
    max: raw.CALL_INVITE_RATE_MAX,
  },

  callSignaling: {
    enabled: String(raw.CALL_SIGNALING_ENABLED).trim().toLowerCase() === 'true',
    ringTimeoutSeconds: raw.CALL_RING_TIMEOUT_SECONDS,
    disconnectGraceSeconds: raw.CALL_DISCONNECT_GRACE_SECONDS,
    ticketTtlSeconds: raw.SIGNALING_TICKET_TTL_SECONDS,
    ticketRateLimit: {
      windowMs: raw.SIGNALING_TICKET_RATE_WINDOW_MINUTES * 60 * 1000,
      max: raw.SIGNALING_TICKET_RATE_MAX,
    },
    ice: {
      stunUrls: splitList(raw.STUN_URLS),
      turnUrls: splitList(raw.TURN_URLS),
      turnSharedSecret: raw.TURN_SHARED_SECRET,
      turnUsername: raw.TURN_USERNAME,
      turnCredential: raw.TURN_CREDENTIAL,
      turnCredentialTtlSeconds: raw.TURN_CREDENTIAL_TTL_SECONDS,
    },
  },

  push: {
    enabled: String(raw.PUSH_ENABLED).trim().toLowerCase() === 'true',
    serviceAccountFile: raw.FCM_SERVICE_ACCOUNT_FILE,
    showCallerName: String(raw.PUSH_SHOW_CALLER_NAME).trim().toLowerCase() === 'true',
  },
};

export function assertAuthKeysConfigured() {
  if (!env.jwt.privateKey || !env.jwt.publicKey) {
    throw new Error(
      'Signing keys are not configured. Run `npm run keys` to generate an ' +
        'RS256 keypair, or set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (PEM).'
    );
  }
}
