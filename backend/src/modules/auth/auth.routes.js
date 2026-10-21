import { Router } from 'express';
import { login, refresh, logout, me, register } from './auth.controller.js';
import { loginSchema, refreshSchema, logoutSchema, registerSchema } from './auth.schemas.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema), login);
router.post('/register', loginRateLimiter, validate(registerSchema), register);
router.post('/refresh', loginRateLimiter, validate(refreshSchema), refresh);
router.post('/logout', validate(logoutSchema), logout);
router.get('/me', authenticate, me);

export default router;
