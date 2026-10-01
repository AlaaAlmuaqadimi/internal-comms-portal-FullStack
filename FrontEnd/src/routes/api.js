const express = require('express');
const { requireAuthApi } = require('../middleware/auth');
const api = require('../controllers/apiController');

const router = express.Router();
router.use(requireAuthApi);

router.get('/calls', api.listCalls);
router.get('/contacts', api.listContacts);
router.get('/kitchens', api.listKitchens);
router.get('/notifications', api.listNotifications);

module.exports = router;
