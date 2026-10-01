const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');

const config = require('./src/config');
const routes = require('./src/routes');
const { loadUser } = require('./src/middleware/auth');
const csrf = require('./src/middleware/csrf');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.agencyName = config.agencyName;

// CSP allows only the CDNs the design uses (Tailwind, Lucide, Google Fonts, Pexels photos).
// upgrade-insecure-requests is disabled so the site also works over plain http://localhost
// (Safari otherwise tries to load /css and /js over https and shows an unstyled page).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://images.pexels.com'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  cookieSession({
    name: 'sid',
    keys: [config.sessionSecret],
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
  })
);
app.use(loadUser);
app.use(csrf);

app.use('/', routes);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`✅ Server running at http://localhost:${config.port} (${config.env})`); // eslint-disable-line no-console
});

module.exports = app;
