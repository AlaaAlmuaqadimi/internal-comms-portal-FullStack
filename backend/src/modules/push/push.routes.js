import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { pushDeclineRateLimiter } from '../../middleware/rateLimit.js';
import { declineCall, registerToken, unregisterToken } from './push.controller.js';
import {
  pushDeclineSchema,
  registerPushTokenSchema,
  unregisterPushTokenSchema,
} from './push.schemas.js';

const router = Router();

// The phone registers its FCM token after sign-in and removes it on sign-out.
router.post('/tokens', authenticate, validate(registerPushTokenSchema), registerToken);
router.delete('/tokens', authenticate, validate(unregisterPushTokenSchema), unregisterToken);

// Decline on a closed app: no sign-in, the body carries a one-call token.
router.post('/decline', pushDeclineRateLimiter, validate(pushDeclineSchema), declineCall);

export default router;
