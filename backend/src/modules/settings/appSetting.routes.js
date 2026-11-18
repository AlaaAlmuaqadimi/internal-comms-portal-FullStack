import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import {
  listAppSettings,
  updateAppSettings,
} from './appSetting.controller.js';

const router = Router();

// `/app` is the explicit path; `/` is an alias so an admin client can mount the
// settings module directly. Only administrators may change the values.
router.get('/', authenticate, listAppSettings);
router.patch('/', authenticate, requireAdmin, updateAppSettings);
router.get('/app', authenticate, listAppSettings);
router.patch('/app', authenticate, requireAdmin, updateAppSettings);

export default router;
