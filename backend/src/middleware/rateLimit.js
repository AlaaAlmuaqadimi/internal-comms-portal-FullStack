import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const loginRateLimiter = rateLimit({
  windowMs: env.loginRateLimit.windowMs,
  max: env.loginRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again later.',
      code: 'RATE_LIMITED',
    });
  },
});
