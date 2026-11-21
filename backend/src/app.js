import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

/** Allowed browser origins: the configured list, else none in production. */
export function corsOrigin() {
  if (env.corsOrigins.length > 0) return env.corsOrigins;
  return !env.isProduction;
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  // The mobile app sends no Origin header, so CORS only matters for browsers.
  // Production allows only CORS_ORIGINS (none by default); development any.
  app.use(cors({ origin: corsOrigin(), credentials: true }));
  // Profile avatars are sent as base64 data URLs: only the profile update
  // gets a large body; everything else stays small (less memory per request).
  app.use('/api/auth/update', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '200kb' }));
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.logFormat));
  }

  app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok' });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
