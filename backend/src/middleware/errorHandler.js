import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: 'غير موجود', code: 'NOT_FOUND' });
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
    return res.status(400).json({ success: false, error: 'بيانات JSON غير صالحة', code: 'BAD_REQUEST' });
  }

  // Body too large (413) and other client errors raised by body-parser: answer
  // with their own 4xx status instead of a misleading 500 and a logged stack.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'حجم الطلب كبير جداً', code: 'PAYLOAD_TOO_LARGE' });
  }
  const clientStatus = Number(err?.status || err?.statusCode);
  if (err?.expose && clientStatus >= 400 && clientStatus < 500) {
    return res.status(clientStatus).json({ success: false, error: 'طلب غير صالح', code: 'BAD_REQUEST' });
  }

  if (env.nodeEnv !== 'test') {
    console.error('[error]', err);
  }
  return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم', code: 'INTERNAL' });
}
