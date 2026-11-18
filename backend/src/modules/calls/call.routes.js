import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { callInviteRateLimiter } from '../../middleware/rateLimit.js';
import { requireCallOversight } from '../../middleware/requireCallOversight.js';
import { inviteCallSchema } from './call.schemas.js';
import {
  acceptCall,
  cancelCall,
  declineCall,
  endCall,
  getCall,
  inviteCall,
  listCalls,
  listOversightCalls,
  missCall,
} from './call.controller.js';

const router = Router();

// Invitations are the one call action that is rate limited per user.
router.post('/', authenticate, callInviteRateLimiter, validate(inviteCallSchema), inviteCall);
router.post('/invite', authenticate, callInviteRateLimiter, validate(inviteCallSchema), inviteCall);

router.get('/', authenticate, listCalls);
router.get('/history', authenticate, listCalls);
// Must stay before `/:id` so "oversight" is not treated as a call id.
router.get('/oversight', authenticate, requireCallOversight, listOversightCalls);
router.get('/:id', authenticate, getCall);

router.post('/:id/accept', authenticate, acceptCall);
router.post('/:id/answer', authenticate, acceptCall);
router.post('/:id/decline', authenticate, declineCall);
router.post('/:id/reject', authenticate, declineCall);
router.post('/:id/cancel', authenticate, cancelCall);
router.post('/:id/end', authenticate, endCall);
router.post('/:id/missed', authenticate, missCall);

export default router;
