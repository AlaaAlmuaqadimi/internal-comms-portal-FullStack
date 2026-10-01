const express = require('express');
const authRouter = require('./auth');
const pagesRouter = require('./pages');
const apiRouter = require('./api');

const router = express.Router();
router.use('/api', apiRouter);
router.use('/', authRouter);
router.use('/', pagesRouter);

module.exports = router;
