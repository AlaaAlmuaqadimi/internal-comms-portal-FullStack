const express = require('express');
const { requireAuth } = require('../middleware/auth');
const pages = require('../controllers/pagesController');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.redirect('/calls'));
router.get('/calls', requireAuth, pages.callsPage);
router.get('/call/active', requireAuth, pages.callActivePage);
router.get('/directory', requireAuth, pages.directoryPage);
router.get('/notifications', requireAuth, pages.notificationsPage);
router.get('/settings', requireAuth, pages.settingsPage);
router.post('/settings/contacts', requireAuth, pages.updateContacts);
router.post('/settings/kitchen', requireAuth, pages.updateKitchenChoice);

router.get('/org', requireAuth, pages.orgPage);
router.post('/org/units', requireAuth, pages.addUnit);
router.post('/org/units/:id', requireAuth, pages.renameUnit);
router.post('/org/units/:id/delete', requireAuth, pages.removeUnit);

module.exports = router;
