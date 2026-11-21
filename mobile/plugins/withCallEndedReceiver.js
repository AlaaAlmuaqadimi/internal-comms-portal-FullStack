const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Copies plugins/CallEndedReceiver.kt into the generated Android project, with
 * its package rewritten to the app's package.
 *
 * The manifest <receiver> entry is added by the expo-callkit-telecom plugin
 * from its `androidEventReceiver` option (app.json), so the broadcast action
 * lives in one place.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
function withCallEndedReceiver(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const packageName = modConfig.android?.package;
      if (!packageName) throw new Error('withCallEndedReceiver: android.package is not set');
      const packageDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.')
      );
      fs.mkdirSync(packageDir, { recursive: true });
      const source = fs
        .readFileSync(path.join(__dirname, 'CallEndedReceiver.kt'), 'utf8')
        .replace(/^package .*$/m, `package ${packageName}`);
      fs.writeFileSync(path.join(packageDir, 'CallEndedReceiver.kt'), source);
      return modConfig;
    },
  ]);
}

module.exports = withCallEndedReceiver;
