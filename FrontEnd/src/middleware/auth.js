const accountService = require('../services/accountService');

/** Attaches req.user / res.locals.currentUser from the signed session cookie. */
function loadUser(req, res, next) {
  res.locals.currentUser = null;
  // One-time message stored by a previous request (shown as a toast).
  res.locals.flash = (req.session && req.session.flash) || null;
  if (res.locals.flash) req.session.flash = null;
  const id = req.session && req.session.userId;
  if (id) {
    const user = accountService.findUserById(id);
    if (user) {
      req.user = user;
      res.locals.currentUser = accountService.toProfile(user);
    } else {
      req.session = null; // stale session (user no longer exists)
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAuthApi(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function redirectIfAuth(req, res, next) {
  if (req.user) return res.redirect('/');
  return next();
}

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')
    ? url
    : '/';
}

module.exports = { loadUser, requireAuth, requireAuthApi, redirectIfAuth, safeNext };
