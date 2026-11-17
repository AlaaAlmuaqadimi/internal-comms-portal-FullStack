import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import {
  getMyUnreadCount,
  getNotificationReceipts,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  publishNotification,
} from './notification.controller.js';
import { createNotificationSchema } from './notification.schemas.js';

const router = Router();

// Every authenticated employee reads and acknowledges only their own inbox.
// The service filters by the employee id from the access token, so a caller
// cannot request someone else's notifications.
router.get('/', authenticate, listMyNotifications);
router.get('/unread-count', authenticate, getMyUnreadCount);
router.post('/read-all', authenticate, markAllNotificationsRead);
router.get('/:id/receipts', authenticate, getNotificationReceipts);
router.post('/:id/read', authenticate, markNotificationRead);

// Any authenticated employee can publish, but the service only delivers the
// notification to the recipients they selected (or to all active employees
// when "everyone" is chosen).
router.post('/', authenticate, validate(createNotificationSchema), publishNotification);

export default router;
