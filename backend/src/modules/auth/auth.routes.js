import { Router } from 'express';
import { login, refresh, logout, me, updateProfile } from './auth.controller.js';
import {
  loginSchema,
  refreshSchema,
  logoutSchema,
  updateProfileSchema,
} from './auth.schemas.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimiter, refreshRateLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema), login);
// No self-registration: accounts are created by an admin (POST /api/users).
router.post('/refresh', refreshRateLimiter, validate(refreshSchema), refresh);
router.post('/logout', validate(logoutSchema), logout);
router.get('/me', authenticate, me);
router.put('/update', authenticate, validate(updateProfileSchema), updateProfile);

export default router;
