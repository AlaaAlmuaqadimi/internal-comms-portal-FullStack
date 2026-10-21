import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: 'Not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Body parser / malformed JSON
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON body', code: 'BAD_REQUEST' });
  }

  if (env.nodeEnv !== 'test') {
    console.error('[error]', err);
  }
  return res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL' });
}
