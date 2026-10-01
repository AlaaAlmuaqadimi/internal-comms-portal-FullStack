const dataService = require('../services/dataService');
const accountService = require('../services/accountService');
const { callsFor } = require('./pagesController');

const listCalls = (req, res) => res.json(callsFor(req.user));
const listContacts = (req, res) => res.json(accountService.getContactsFor(req.user));
const listKitchens = (req, res) => res.json(accountService.getKitchensFor(req.user));
const listNotifications = (req, res) => res.json(dataService.getNotifications());

module.exports = { listCalls, listContacts, listKitchens, listNotifications };
