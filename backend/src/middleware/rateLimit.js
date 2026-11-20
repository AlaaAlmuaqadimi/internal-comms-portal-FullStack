import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

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

/**
 * Token refresh. Kept apart from the login limiter so that routine refreshes
 * (every ACCESS_TOKEN_TTL, from every device behind an office NAT) never use
 * up the login budget or get people signed out. Refresh tokens are 256-bit
 * random values, so this only caps abuse; it is not what makes them safe.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: env.loginRateLimit.windowMs,
  max: env.loginRateLimit.refreshMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
  },
});

/**
 * Per-user limiter for call invitations. `authenticate` must run first so the
 * key is the signed-in user rather than an IP shared by an office NAT.
 *
 * A rate-limited invite is still a denied call, so it is written to the audit
 * trail as `call.denied` with reason RATE_LIMITED.
 */
export const callInviteRateLimiter = rateLimit({
  windowMs: env.callInviteRateLimit.windowMs,
  max: env.callInviteRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous',
  handler: (req, res) => {
    const metadata = JSON.stringify({
      reason: 'RATE_LIMITED',
      callerUserId: req.user?.id ?? null,
      callerEmployeeId: req.user?.employeeId ?? null,
      targetEmployeeId: req.body?.calleeEmployeeId ?? req.body?.targetEmployeeId ?? null,
    });
    pool
      .execute(
        `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES (?, 'call.denied', 'call', NULL, ?)`,
        [req.user?.id ?? null, metadata]
      )
      .catch(() => {});

    res.status(429).json({
      success: false,
      error: 'تم تجاوز الحد المسموح من محاولات الاتصال. يرجى المحاولة لاحقاً.',
      code: 'CALL_RATE_LIMITED',
    });
  },
});

/** Per-user limiter for signalling tickets (Phase B). */
export const signalingTicketRateLimiter = rateLimit({
  windowMs: env.callSignaling.ticketRateLimit.windowMs,
  max: env.callSignaling.ticketRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.',
      code: 'CALL_RATE_LIMITED',
    });
  },
});
