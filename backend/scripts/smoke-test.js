/**
 * End-to-end smoke test for the auth module.
 *
 *   node scripts/smoke-test.js            (uses PORT from env, default 4000)
 *
 * Starts the server as a child process, waits for /health, then exercises:
 *   login -> me -> refresh rotation -> refresh reuse detection -> bad password.
 * Exits 0 when every assertion passes.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4000);
const BASE = `http://127.0.0.1:${PORT}`;
const USERNAME = process.env.SEED_USERNAME || 'admin';
const PASSWORD = process.env.SEED_PASSWORD || 'password123';

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function request(method, pathname, { body, token } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { status } = await request('GET', '/health');
      if (status === 200) return true;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  console.log(`[smoke] starting server on port ${PORT} ...`);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  const cleanup = () => {
    if (!child.killed) child.kill();
  };

  try {
    const up = await waitForHealth();
    if (!up) {
      console.error('[smoke] server did not become healthy in 30s');
      process.exitCode = 1;
      return;
    }

    // 1. login
    const login = await request('POST', '/api/auth/login', {
      body: { username: USERNAME, password: PASSWORD },
    });
    check(
      'login returns 200',
      login.status === 200 && login.data?.success === true,
      `status=${login.status} ${login.data?.error || ''}`
    );
    const accessToken = login.data?.accessToken;
    const refreshToken = login.data?.refreshToken;
    check('login returns accessToken', typeof accessToken === 'string' && accessToken.length > 100);
    check('login returns refreshToken', typeof refreshToken === 'string' && refreshToken.length > 20);
    check(
      'login returns user with permissions',
      login.data?.user?.username === USERNAME && typeof login.data?.user?.permissions === 'undefined',
      `user=${login.data?.user?.name}`
    );

    // 2. me
    const me = await request('GET', '/api/auth/me', { token: accessToken });
    check('me returns 200', me.status === 200 && me.data?.success === true, `status=${me.status}`);
    const perms = me.data?.user?.permissions || {};
    check(
      'me exposes admin permissions',
      perms['users.manage']?.global === true && perms['audit.read']?.global === true,
      `roles=${(me.data?.user?.roles || []).join(',')}`
    );

    // 3. refresh rotation
    const refresh1 = await request('POST', '/api/auth/refresh', { body: { refreshToken } });
    check('refresh returns 200', refresh1.status === 200 && refresh1.data?.success === true, `status=${refresh1.status}`);
    const rotatedToken = refresh1.data?.refreshToken;
    check('refresh rotates the token', typeof rotatedToken === 'string' && rotatedToken !== refreshToken);

    // 4. reuse of the ORIGINAL token must be rejected and revoke the family
    const reuse = await request('POST', '/api/auth/refresh', { body: { refreshToken } });
    check(
      'reused refresh token is rejected',
      reuse.status === 401 && reuse.data?.code === 'REFRESH_REUSED',
      `status=${reuse.status} code=${reuse.data?.code}`
    );

    // 5. the rotated token is now dead too (family revoked)
    const afterFamilyRevoke = await request('POST', '/api/auth/refresh', {
      body: { refreshToken: rotatedToken },
    });
    check(
      'family revocation cascades',
      afterFamilyRevoke.status === 401,
      `status=${afterFamilyRevoke.status} code=${afterFamilyRevoke.data?.code}`
    );

    // 6. bad password
    const bad = await request('POST', '/api/auth/login', {
      body: { username: USERNAME, password: 'definitely-wrong' },
    });
    check(
      'wrong password is rejected',
      bad.status === 401 && bad.data?.code === 'INVALID_CREDENTIALS',
      `status=${bad.status} code=${bad.data?.code}`
    );

    // 7. protected route without token
    const noToken = await request('GET', '/api/auth/me');
    check(
      'missing token is rejected',
      noToken.status === 401 && noToken.data?.code === 'UNAUTHORIZED',
      `status=${noToken.status} code=${noToken.data?.code}`
    );
  } catch (err) {
    console.error('[smoke] error:', err.message);
    process.exitCode = 1;
  } finally {
    cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 500);
  } else {
    setTimeout(() => process.exit(0), 500);
  }
}

main();
