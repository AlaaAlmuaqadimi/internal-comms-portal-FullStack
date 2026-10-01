const config = require('../config');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const page = (title, body) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>` +
  `<body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#14283f;">${body}<p><a href="/">العودة إلى الرئيسية</a></p></body></html>`;

function notFoundHandler(req, res) {
  res.status(404);
  if (req.accepts('html')) return res.type('html').send(page('الصفحة غير موجودة', '<h1>404 — الصفحة غير موجودة</h1><p>الرابط الذي حاولت الوصول إليه غير متاح.</p>'));
  return res.json({ error: 'Not Found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const isDev = config.env === 'development';
  if (status >= 500) console.error(err); // eslint-disable-line no-console

  res.status(status);
  // 4xx messages are written by us for users; 5xx details are only shown in development.
  const message = status < 500 ? err.message : 'حدث خطأ غير متوقع. يرجى إعادة المحاولة لاحقًا.';
  if (req.accepts('html')) {
    return res.type('html').send(
      page('حدث خطأ', `<h1>${status === 403 ? 'غير مسموح' : 'تعذّر إكمال الطلب'} (${status})</h1><p>${esc(message)}</p>` +
        (isDev && status >= 500 ? `<pre style="text-align:left;direction:ltr;white-space:pre-wrap;">${esc(err.stack)}</pre>` : ''))
    );
  }
  return res.json({ error: status < 500 || isDev ? err.message : 'Internal Server Error' });
}

module.exports = { notFoundHandler, errorHandler };
