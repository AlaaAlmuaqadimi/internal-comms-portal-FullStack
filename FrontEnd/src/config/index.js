require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const sessionSecret = process.env.SESSION_SECRET;

if (env === 'production' && !sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production (see .env.example)');
}

module.exports = {
  env,
  port: parseInt(process.env.PORT, 10) || 3000,
  agencyName: process.env.AGENCY_NAME || 'مصلحة الضرائب',
  sessionSecret: sessionSecret || 'dev-only-secret-change-me',
  // Set COOKIE_SECURE=true only when the site is served over HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
