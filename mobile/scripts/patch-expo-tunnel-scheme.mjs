#!/usr/bin/env node
/**
 * expo-tunnel-scheme
 * ---------------------------------------------------------------------------
 * Restores the correct URL scheme for Expo Go deep links when Metro is exposed
 * through an HTTPS-only tunnel.
 *
 * Why this exists
 * ---------------
 * The Expo CLI builds the Expo Go deep link with the `exp://` scheme whenever
 * the request did not carry `x-forwarded-proto: https` — which is always the
 * case for the locally printed QR code. `exp://` is HTTP, but the default
 * SDK 58 tunnel (`*.on.expo.app`, and ngrok/cloudflared as well) terminates
 * TLS and answers plain HTTP with `301 https://…`. Expo Go does not follow
 * that redirect, so the device lands on "Not Found".
 *
 * Expo Go already understands the secure counterpart: `exps://` is mapped to
 * HTTPS by the client (see the comment in @expo/cli itself). This script
 * patches the CLI so that:
 *
 *   1. `constructExpoGoUrl()` returns `exps://…` for HTTPS tunnels,
 *   2. `constructLoadingUrl()` (the interstitial page) uses `https://…`,
 *   3. `isRedirectPageEnabled()` is disabled while tunnelling, so the QR code
 *      encodes the secure deep link directly instead of an HTTP hop.
 *
 * LAN / localhost behaviour is untouched: those servers are plain HTTP and
 * keep using `exp://` + `http://`.
 *
 * Usage
 * -----
 *   node scripts/patch-expo-tunnel-scheme.mjs          # apply (idempotent)
 *   node scripts/patch-expo-tunnel-scheme.mjs --check   # exit 1 if missing
 *   node scripts/patch-expo-tunnel-scheme.mjs --revert  # restore backups
 *
 * The patch lives in node_modules, so `postinstall` re-applies it after every
 * `npm install`. Bump/verify it when the `expo` version changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'expo-tunnel-scheme';
const BACKUP_SUFFIX = '.expo-tunnel-scheme.bak';

const args = new Set(process.argv.slice(2));
const mode = args.has('--revert') ? 'revert' : args.has('--check') ? 'check' : 'apply';

const URL_CREATOR = 'build/src/start/server/UrlCreator.js';
const BUNDLER_SERVER = 'build/src/start/server/BundlerDevServer.js';

/** Every @expo/cli copy that might serve this project (hoisted or nested). */
function findCliRoots() {
  const roots = new Set();
  const direct = [
    path.join(MOBILE_ROOT, 'node_modules', '@expo', 'cli'),
    path.join(MOBILE_ROOT, 'node_modules', 'expo', 'node_modules', '@expo', 'cli'),
  ];
  for (const dir of direct) {
    if (fs.existsSync(path.join(dir, URL_CREATOR))) roots.add(dir);
  }

  // Some package managers nest the CLI deeper (e.g. pnpm-style layouts).
  const nodeModules = path.join(MOBILE_ROOT, 'node_modules');
  for (const entry of fs.existsSync(nodeModules) ? fs.readdirSync(nodeModules) : []) {
    const nested = path.join(nodeModules, entry, 'node_modules', '@expo', 'cli');
    if (fs.existsSync(path.join(nested, URL_CREATOR))) roots.add(nested);
  }
  return [...roots];
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function newlineOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function backupOnce(file, original) {
  const backup = `${file}${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
  return backup;
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) throw new Error(`${label}: anchor not found (unsupported @expo/cli layout)`);
  if (source.indexOf(needle, first + 1) !== -1) {
    throw new Error(`${label}: anchor is not unique`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

/** Apply a replacement unless it is already present, so partial runs are safe. */
function replaceIfNeeded(source, needle, replacement, label) {
  if (source.includes(replacement)) return { source, applied: false };
  return { source: replaceOnce(source, needle, replacement, label), applied: true };
}

function lines(text) {
  const nl = newlineOf(text);
  return (block) => block.split('\n').join(nl);
}

/** Rewrite UrlCreator.js: secure Expo Go deep link + secure interstitial page. */
function patchUrlCreator(file) {
  const original = readText(file);
  const to = lines(original);

  const oldConstruct = to(`    /** Create a URL for launching in Expo Go, e.g. \`exp://192.168.1.10:8081\`. */ constructExpoGoUrl(options, scheme = 'exp') {
        return withDevMenuLaunchParams(this.constructUrl({
            ...options,
            scheme
        }));
    }`);

  const newConstruct = to(`    /** Create a URL for launching in Expo Go, e.g. \`exp://192.168.1.10:8081\`. */ constructExpoGoUrl(options, scheme = 'exp') {
        return withDevMenuLaunchParams(this.constructUrl({
            ...options,
            scheme: this.resolveExpoGoScheme(options, scheme)
        }));
    }
    /**
   * [expo-tunnel-scheme] Expo Go maps \`exps://\` to HTTPS. HTTPS-only tunnels
   * (\`*.on.expo.app\`, ngrok, https proxies) answer \`http://\` with a 301, which
   * surfaces on the device as "Not Found". Keep \`exp://\` for plain HTTP
   * (LAN / localhost) servers.
   */
    resolveExpoGoScheme(options, scheme) {
        if (scheme !== 'exp') return scheme;
        if (options?.forwarded?.protocol === 'https') return 'exps';
        if (this.isHttpsEndpoint(this.bundlerInfo?.getProxyUrl?.())) return 'exps';
        if (this.defaults?.hostType === 'tunnel' && this.isHttpsEndpoint(this.bundlerInfo?.getTunnelUrl?.(), true)) {
            return 'exps';
        }
        return scheme;
    }
    /**
   * [expo-tunnel-scheme] The loading/interstitial page is served by Metro, so
   * it needs the same TLS treatment as the deep link it points at.
   */
    resolveWebScheme() {
        if (this.isHttpsEndpoint(this.bundlerInfo?.getProxyUrl?.())) return 'https';
        if (this.defaults?.hostType === 'tunnel' && this.isHttpsEndpoint(this.bundlerInfo?.getTunnelUrl?.(), true)) {
            return 'https';
        }
        return 'http';
    }
    /** [expo-tunnel-scheme] \`true\` for https URLs; \`allowEmpty\` treats a not-yet-ready tunnel as https. */
    isHttpsEndpoint(url, allowEmpty = false) {
        if (!url) return allowEmpty;
        return url.startsWith('https://');
    }`);

  let next = original;
  let applied = false;

  const construct = replaceIfNeeded(next, oldConstruct, newConstruct, 'UrlCreator.constructExpoGoUrl');
  next = construct.source;
  applied = applied || construct.applied;

  // The interstitial page must be fetched over TLS too (single hard-coded scheme: 'http').
  const loading = replaceIfNeeded(
    next,
    to(`        const url = new (_url()).URL('_expo/loading', this.constructUrl({
            scheme: 'http',`),
    to(`        const url = new (_url()).URL('_expo/loading', this.constructUrl({
            scheme: this.resolveWebScheme(),`),
    'UrlCreator.constructLoadingUrl'
  );
  next = loading.source;
  applied = applied || loading.applied;

  if (applied) {
    backupOnce(file, original);
    fs.writeFileSync(file, next);
  }
  return applied;
}

/** Keep the QR on the secure deep link and advertise the HTTPS server URL. */
function patchBundlerServer(file) {
  const original = readText(file);
  const to = lines(original);
  let next = original;
  let applied = false;

  const interstitial = replaceIfNeeded(
    next,
    to(`        !this.isDevClient && // Checks if dev client is installed.
        !!_resolvefrom().default.silent(this.projectRoot, 'expo-dev-client');`),
    to(`        !this.isDevClient && // Checks if dev client is installed.
        // [expo-tunnel-scheme] Behind an https-only tunnel the QR must encode the
        // secure deep link directly; an http interstitial would 301 first.
        this.urlCreator?.defaults?.hostType !== 'tunnel' && !!_resolvefrom().default.silent(this.projectRoot, 'expo-dev-client');`),
    'BundlerDevServer.isRedirectPageEnabled'
  );
  next = interstitial.source;
  applied = applied || interstitial.applied;

  // `Waiting on http://…on.expo.app` was misleading: the WS tunnel is HTTPS-only.
  const serverUrl = replaceIfNeeded(
    next,
    to(`        if (this.tunnel && this.tunnel instanceof _AsyncWsTunnel.AsyncWsTunnel) {
            return this.getUrlCreator().constructUrl();
        }`),
    to(`        if (this.tunnel && this.tunnel instanceof _AsyncWsTunnel.AsyncWsTunnel) {
            // [expo-tunnel-scheme] The WS tunnel terminates TLS; advertise the secure URL.
            return this.getUrlCreator().constructUrl({
                scheme: 'https'
            });
        }`),
    'BundlerDevServer.getDevServerUrl'
  );
  next = serverUrl.source;
  applied = applied || serverUrl.applied;

  if (applied) {
    backupOnce(file, original);
    fs.writeFileSync(file, next);
  }
  return applied;
}

function revert(file) {
  const backup = `${file}${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backup)) return false;
  fs.copyFileSync(backup, file);
  fs.unlinkSync(backup);
  return true;
}

/** Load the patched UrlCreator and assert the scheme decisions. */
function selfTest(urlCreatorFile) {
  const require = createRequire(import.meta.url);
  const { UrlCreator } = require(urlCreatorFile);

  const make = (defaults, { tunnelUrl, proxyUrl } = {}) =>
    new UrlCreator(defaults, {
      getTunnelUrl: () => tunnelUrl ?? null,
      getProxyUrl: () => proxyUrl ?? null,
      getPort: () => 8081,
    });

  const tunnel = make({ hostType: 'tunnel' }, { tunnelUrl: 'https://demo.on.expo.app' });
  const lan = make({ hostType: 'lan' });

  const checks = [
    ['tunnel deep link', tunnel.constructExpoGoUrl({}), 'exps://demo.on.expo.app'],
    ['tunnel loading page', tunnel.constructLoadingUrl({}), 'https://demo.on.expo.app/_expo/loading'],
    ['lan deep link', lan.constructExpoGoUrl({}), 'exp://'],
    ['lan loading page', lan.constructLoadingUrl({}), 'http://'],
    [
      'forwarded https',
      make({ hostType: 'tunnel' }, { tunnelUrl: 'https://demo.on.expo.app' }).constructExpoGoUrl({
        forwarded: { protocol: 'https', authority: 'demo.on.expo.app' },
      }),
      'exps://demo.on.expo.app',
    ],
    [
      'https proxy',
      make({ hostType: 'localhost' }, { proxyUrl: 'https://proxy.example.com' }).constructExpoGoUrl({}),
      'exps://proxy.example.com',
    ],
  ];

  const failures = [];
  for (const [label, actual, expected] of checks) {
    const ok = actual.startsWith(expected);
    if (!ok) failures.push(`${label}: expected ${expected}…, got ${actual}`);
  }
  return failures;
}

function main() {
  const roots = findCliRoots();
  if (roots.length === 0) {
    console.warn('[expo-tunnel-scheme] @expo/cli not found — skipping (run `npm install` first).');
    return 0;
  }

  if (mode === 'revert') {
    let restored = 0;
    for (const root of roots) {
      for (const rel of [URL_CREATOR, BUNDLER_SERVER]) {
        if (revert(path.join(root, rel))) restored += 1;
      }
    }
    console.log(`[expo-tunnel-scheme] reverted ${restored} file(s).`);
    return 0;
  }

  if (mode === 'check') {
    const missing = [];
    for (const root of roots) {
      if (!readText(path.join(root, URL_CREATOR)).includes(MARKER)) missing.push(root);
    }
    if (missing.length) {
      console.error(`[expo-tunnel-scheme] not applied to: ${missing.join(', ')}`);
      return 1;
    }
    return 0;
  }

  let changed = 0;
  let failures = [];

  for (const root of roots) {
    const urlCreatorFile = path.join(root, URL_CREATOR);
    const bundlerServerFile = path.join(root, BUNDLER_SERVER);

    try {
      const urlChanged = patchUrlCreator(urlCreatorFile);
      const serverChanged = patchBundlerServer(bundlerServerFile);
      if (urlChanged || serverChanged) {
        changed += 1;
        console.log(`[expo-tunnel-scheme] patched ${path.relative(MOBILE_ROOT, root)}`);
      }
      failures = failures.concat(selfTest(urlCreatorFile));
    } catch (error) {
      console.warn(`[expo-tunnel-scheme] ${path.relative(MOBILE_ROOT, root)}: ${error.message}`);
      console.warn('[expo-tunnel-scheme] nothing changed — Expo Go tunnel may need manual `exps://` entry.');
    }
  }

  if (changed === 0) console.log('[expo-tunnel-scheme] already applied.');

  if (failures.length) {
    console.error('[expo-tunnel-scheme] self-test failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }

  console.log('[expo-tunnel-scheme] Expo Go deep links use exps:// on https tunnels.');
  return 0;
}

process.exitCode = main();
