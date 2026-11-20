/**
 * Extends app.json at build time.
 *
 * Firebase (Phase D push): `google-services.json` is git-ignored because the
 * repository is public, so EAS cannot see the local file. On EAS it comes from
 * the file environment variable GOOGLE_SERVICES_JSON
 * (`eas env:create --name GOOGLE_SERVICES_JSON --type file ...`); locally the
 * file in this folder is used. Without either, the app still builds and calls
 * still ring while the app is open (no push when it is closed).
 */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const localFile = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? './google-services.json' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
