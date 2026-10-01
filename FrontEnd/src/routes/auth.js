const express = require('express');
const rateLimit = require('../middleware/rateLimit');
const { redirectIfAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

router.get('/login', redirectIfAuth, authController.showLogin);
router.post('/login', loginLimiter, authController.login);
router.get('/register', authController.showRegister);
router.get('/register/candidates', authController.candidates);
router.post('/register', registerLimiter, authController.register);
router.post('/logout', authController.logout);

module.exports = router;
