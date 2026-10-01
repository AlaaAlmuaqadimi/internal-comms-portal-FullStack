const crypto = require('crypto');
const accountService = require('../services/accountService');
const org = require('../services/orgService');
const { safeNext } = require('../middleware/auth');

const clean = (v, max = 100) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

function startSession(req, user) {
  // Fresh session object (new CSRF token) on every login.
  req.session = { userId: user.id, csrf: crypto.randomBytes(24).toString('hex') };
}

function showLogin(req, res) {
  res.render('pages/login', { title: 'تسجيل الدخول', next: safeNext(req.query.next), errors: [], values: {} });
}

function login(req, res) {
  const username = clean(req.body.username, 30);
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const user = accountService.findUserByUsername(username);

  let ok = false;
  if (user) ok = accountService.verifyPassword(password, user);
  else accountService.burnVerify(password);

  if (!ok) {
    return res.status(401).render('pages/login', {
      title: 'تسجيل الدخول', next, errors: ['اسم المستخدم أو كلمة المرور غير صحيحة.'], values: { username },
    });
  }
  startSession(req, user);
  accountService.setStatus(user.id, 'online');
  return res.redirect(next);
}

function renderRegister(res, status, errors, values) {
  const selectable = org.isSelectable(values.unit);
  res.status(status).render('pages/register', {
    title: 'إنشاء حساب',
    active: 'directory',
    errors,
    values,
    unitGroups: org.unitOptions(),
    candidateGroups: selectable ? accountService.groupByRelation(accountService.getCandidates(values.unit)) : null,
    kitchenOptions: selectable ? accountService.getKitchenOptionsForUnit(values.unit) : { type: 'none' },
  });
}

function showRegister(req, res) {
  renderRegister(res, 200, [], { contacts: [] });
}

/** HTML fragment: accounts available for a given place in the hierarchy (used by the form). */
function candidates(req, res) {
  const unit = String(req.query.unit || '');
  const selectable = org.isSelectable(unit);
  res.set('Cache-Control', 'no-store');
  res.render('partials/candidates', {
    groups: selectable ? accountService.groupByRelation(accountService.getCandidates(unit)) : null,
    kitchenOptions: selectable ? accountService.getKitchenOptionsForUnit(unit) : { type: 'none' },
    kitchenChoice: null,
    selected: [],
  });
}

function register(req, res) {
  const b = req.body;
  const password = String(b.password || '');

  const values = {
    name: clean(b.name, 60),
    username: clean(b.username, 30),
    unit: clean(b.unit, 20),
    contacts: accountService.parseIds(b.contacts),
    kitchenChoice: clean(b.kitchenChoice, 20),
  };

  const errors = [];
  if (values.name.length < 3) errors.push('الاسم الكامل مطلوب (3 أحرف على الأقل).');
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(values.username)) errors.push('اسم المستخدم يجب أن يتكوّن من 3–30 حرفًا إنجليزيًا أو أرقامًا أو (_ . -).');
  else if (accountService.findUserByUsername(values.username)) errors.push('اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر.');
  if (password.length < 8) errors.push('كلمة المرور يجب ألا تقل عن 8 أحرف.');
  if (password.length > 72) errors.push('كلمة المرور طويلة جدًا (72 حرفًا كحد أقصى).');
  if (password !== String(b.confirm || '')) errors.push('تأكيد كلمة المرور غير مطابق.');
  if (!org.isSelectable(values.unit)) errors.push('اختر موقعك في الهيكل الإداري.');
  else {
    const kOpts = accountService.getKitchenOptionsForUnit(values.unit);
    if (kOpts.type === 'choice' && !kOpts.options.some((o) => o.id === values.kitchenChoice)) {
      errors.push('اختر أحد المطبخين المتاحين لموقعك.');
    }
  }

  if (errors.length) return renderRegister(res, 400, errors, values);

  // Only accounts the hierarchy allows for this position can be granted.
  const eligible = new Set(accountService.getCandidates(values.unit).map((c) => c.id));
  const allowedContacts = values.contacts.filter((id) => eligible.has(id));

  const user = accountService.createUser({
    name: values.name, username: values.username, unitId: values.unit, password, allowedContacts,
    kitchenChoice: values.kitchenChoice || null,
  });

  if (req.user) {
    // An already signed-in person is adding an account: stay signed in as themselves.
    req.session.flash = `تم إنشاء حساب «${user.name}» بنجاح.`;
    return res.redirect('/directory');
  }
  startSession(req, user);
  return res.redirect('/');
}

function logout(req, res) {
  if (req.user) accountService.setStatus(req.user.id, 'offline');
  req.session = null;
  res.redirect('/login');
}

module.exports = { showLogin, login, showRegister, candidates, register, logout };
