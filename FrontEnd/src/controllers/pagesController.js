const dataService = require('../services/dataService');
const accountService = require('../services/accountService');
const org = require('../services/orgService');

const unique = (list, key) => [...new Set(list.map((p) => p[key]).filter(Boolean))];

/** Recent calls, restricted to contacts (people or kitchens) this user is allowed to reach. */
function callsFor(user) {
  const contacts = new Map(accountService.getAllContactsFor(user).map((c) => [String(c.id), c]));
  return dataService
    .getCalls()
    .filter((call) => contacts.has(String(call.contactId)))
    .map((call) => ({ ...call, contact: contacts.get(String(call.contactId)) }));
}

function callsPage(req, res) {
  res.render('pages/calls', { title: 'المكالمات الأخيرة', active: 'calls', calls: callsFor(req.user) });
}

function callActivePage(req, res, next) {
  if (!req.query.contact) return res.redirect('/calls');
  const id = String(req.query.contact);
  // Server-side permission check: only accounts allowed by the hierarchy/registration.
  if (!accountService.canContact(req.user, id)) {
    const err = new Error('لا يمكنك التواصل مع هذا الحساب. يمكنك التواصل فقط مع الحسابات المتاحة لك حسب موقعك في الهيكل الإداري.');
    err.status = 403;
    return next(err);
  }
  return res.render('pages/call-active', {
    title: 'مكالمة صوتية',
    active: 'calls',
    caller: accountService.findContact(req.user, id),
    participants: accountService.getContactsFor(req.user).filter((c) => String(c.id) !== id),
  });
}

function directoryPage(req, res) {
  const employees = accountService.getContactsFor(req.user);
  const kitchens = accountService.getKitchensFor(req.user);
  res.render('pages/directory', {
    title: 'دليل الموظفين',
    active: 'directory',
    employees,
    kitchens,
    options: {
      managements: unique(employees, 'management'),
      sections: unique(employees, 'section'),
    },
  });
}

function notificationsPage(req, res) {
  res.render('pages/notifications', { title: 'الإشعارات', active: 'notifications', notifications: dataService.getNotifications() });
}

function settingsPage(req, res) {
  const candidates = accountService.getCandidates(req.user.unitId, req.user.id);
  res.render('pages/settings', {
    title: 'الإعدادات',
    active: 'settings',
    me: req.user,
    groups: accountService.groupByRelation(candidates),
    selected: req.user.allowedContacts || [],
    kitchenOptions: accountService.getKitchenOptionsForUnit(req.user.unitId),
    kitchenChoice: req.user.kitchenChoice || null,
  });
}

function updateKitchenChoice(req, res) {
  if (accountService.setKitchenChoice(req.user.id, req.body.kitchenChoice)) {
    req.session.flash = 'تم حفظ اختيار المطبخ.';
  } else {
    req.session.flash = 'تعذّر حفظ هذا الاختيار.';
  }
  res.redirect('/settings');
}

function updateContacts(req, res) {
  const eligible = new Set(accountService.getCandidates(req.user.unitId, req.user.id).map((c) => c.id));
  const ids = accountService.parseIds(req.body.contacts).filter((id) => eligible.has(id));
  accountService.setAllowedContacts(req.user.id, ids);
  req.session.flash = 'تم حفظ الحسابات المتاحة للتواصل.';
  res.redirect('/settings');
}

/* ---------------------------- /org: viewable + editable chart ---------------------------- */

function renderOrgNode(node) {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    kitchen: node.kitchen || '',
    inheritedKitchen: org.kitchenNameFor(node.id) || '',
    children: node.children.map(renderOrgNode),
  };
}

function orgPage(req, res) {
  res.render('pages/org', { title: 'الإدارات', active: 'org', tree: renderOrgNode(org.tree()), kinds: org.KINDS });
}

function addUnit(req, res, next) {
  try {
    org.addUnit({ parentId: req.body.parentId, name: req.body.name, kind: req.body.kind, kitchen: req.body.kitchen });
    req.session.flash = 'تمت إضافة الوحدة.';
    return res.redirect('/org');
  } catch (err) {
    return next(err);
  }
}

function renameUnit(req, res, next) {
  try {
    org.renameUnit(req.params.id, req.body.name);
    org.setKitchen(req.params.id, req.body.kitchen);
    req.session.flash = 'تم حفظ تعديلات الوحدة.';
    return res.redirect('/org');
  } catch (err) {
    return next(err);
  }
}

function removeUnit(req, res, next) {
  try {
    org.removeUnit(req.params.id, (unitId) => accountService.hasAccountAtOrBelow(unitId));
    req.session.flash = 'تم حذف الوحدة.';
    return res.redirect('/org');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  callsFor, callsPage, callActivePage, directoryPage, notificationsPage, settingsPage, updateContacts, updateKitchenChoice,
  orgPage, addUnit, renameUnit, removeUnit,
};
