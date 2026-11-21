import { createApp } from './app.js';
import { env, assertAuthKeysConfigured, productionConfigWarnings } from './config/env.js';
import { closePool } from './db/pool.js';
import { attachSignaling, closeSignaling } from './modules/calls/signaling/signaling.server.js';

assertAuthKeysConfigured();
for (const warning of productionConfigWarnings()) {
  console.warn(`[config] ${warning}`);
}

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Phase B signalling. A failure here must not take the REST API down.
attachSignaling(server).catch((err) => {
  console.error('[signaling] failed to start; REST API keeps running:', err?.message || err);
});

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  closeSignaling().catch(() => {});
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
