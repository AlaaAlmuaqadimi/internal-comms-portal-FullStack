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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

const raw = parsed.data;

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
