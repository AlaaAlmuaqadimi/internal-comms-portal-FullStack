import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { registerToken, unregisterToken } from './push.controller.js';
import { registerPushTokenSchema, unregisterPushTokenSchema } from './push.schemas.js';

const router = Router();

// The phone registers its FCM token after sign-in and removes it on sign-out.
router.post('/tokens', authenticate, validate(registerPushTokenSchema), registerToken);
router.delete('/tokens', authenticate, validate(unregisterPushTokenSchema), unregisterToken);

export default router;
