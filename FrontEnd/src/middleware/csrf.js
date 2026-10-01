const crypto = require('crypto');

/** Session-bound CSRF token; forms send it as the hidden field "_csrf". */
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = Buffer.from(String((req.body && req.body._csrf) || ''));
  const expected = Buffer.from(req.session.csrf);
  if (sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
    const err = new Error('انتهت صلاحية الجلسة أو الرمز الأمني غير صالح. حدّث الصفحة وأعد المحاولة.');
    err.status = 403;
    return next(err);
  }
  return next();
}

module.exports = csrf;
