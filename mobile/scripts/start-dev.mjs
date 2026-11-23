#!/usr/bin/env node
/**
 * Starts `expo start` through the real path of the Node.js binary.
 *
 * Node version managers such as fnm run `node` from a temporary per-shell
 * folder (a junction like AppData\Local\fnm_multishells\1234_...\node.exe).
 * Windows Firewall rules name the real install path, so on a network marked
 * "Public" the phone's connection to Metro is silently dropped and the app
 * never loads. Re-running the Expo CLI through the resolved path lets the
 * existing firewall rule apply. Without a version manager the resolved path is
 * the same binary, so behaviour is unchanged.
 *
 * Usage: node scripts/start-dev.mjs [expo start options...]
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expoCli = path.join(mobileRoot, 'node_modules', 'expo', 'bin', 'cli');
const nodeBinary = realpathSync(process.execPath);

const child = spawn(nodeBinary, [expoCli, 'start', ...process.argv.slice(2)], {
  cwd: mobileRoot,
  stdio: 'inherit',
});

// Ctrl+C reaches both processes: let Expo shut down and report its own code.
process.on('SIGINT', () => {});
child.on('error', (err) => {
  console.error(`[start-dev] could not start Expo: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
