const { withDangerousMod, withMainActivity } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Answering a call on a locked phone shows our call screen over the lock
 * screen, without asking for the PIN first (like the phone's own dialer).
 *
 * 1. expo-callkit-telecom's IncomingCallActivity asks for the PIN
 *    (requestDismissKeyguard) after "answer". At prebuild time we change that
 *    one step in node_modules: it opens the app at once and marks the intent
 *    with SHOW_OVER_LOCK. If the library code ever changes shape, nothing is
 *    touched and the old behaviour (PIN first) stays, with a warning.
 * 2. MainActivity shows over the lock screen when it gets that intent.
 * 3. CallContext switches it off as soon as the call ends
 *    (modules/call-lock-screen), so the rest of the app still needs the PIN.
 */
const EXTRA = 'expo.modules.callkittelecom.SHOW_OVER_LOCK';
const MARKER = '[internal-comms] over-lock answer';

function patchIncomingCallActivity(projectRoot) {
  let libRoot;
  try {
    libRoot = path.dirname(require.resolve('expo-callkit-telecom/package.json', { paths: [projectRoot] }));
  } catch {
    console.warn('[withCallLockScreen] expo-callkit-telecom not found; skipped');
    return;
  }
  const file = path.join(
    libRoot,
    'android/src/main/java/expo/modules/callkittelecom/IncomingCallActivity.kt'
  );
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) return; // already patched (local re-run)

  const startNeedle = 'val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager';
  const endNeedle = 'private fun launchMainActivity()';
  const flagsNeedle = 'flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP';
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle);
  if (start < 0 || end < start || !src.includes(flagsNeedle)) {
    console.warn('[withCallLockScreen] IncomingCallActivity changed; PIN-first answer kept');
    return;
  }
  const lineStart = src.lastIndexOf('\n', start) + 1;
  const indent = src.slice(lineStart, start);
  const replacement =
    `${indent}// ${MARKER}: no PIN prompt; the app shows the call over the lock screen\n` +
    `${indent}// and drops back behind it when the call ends.\n` +
    `${indent}launchMainActivity()\n` +
    `${indent}finish()\n` +
    `    }\n\n    `;
  src = src.slice(0, lineStart) + replacement + src.slice(end);
  src = src.replace(flagsNeedle, `${flagsNeedle}\n                putExtra("${EXTRA}", true)`);
  fs.writeFileSync(file, src);
}

function addMainActivityHook(contents) {
  if (contents.includes('applyCallLockScreen')) return contents;
  if (!/^import android\.content\.Intent$/m.test(contents)) {
    contents = contents.replace(/^(package .*\n)/m, `$1\nimport android.content.Intent\n`);
  }
  // Right after super.onCreate(...) in onCreate.
  contents = contents.replace(/(\n(\s*)super\.onCreate\([^)]*\)\s*\n)/, `$1$2applyCallLockScreen(intent)\n`);

  const hook = `
  // Answered on a locked phone: show the call over the lock screen (see
  // plugins/withCallLockScreen.js). CallContext turns it off when the call ends.
  private fun applyCallLockScreen(intent: Intent?) {
    if (intent?.getBooleanExtra("${EXTRA}", false) != true) return
    if (android.os.Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
  }
`;
  const newIntent = /override fun onNewIntent\((\w+): Intent\??\)\s*\{\s*\n(\s*)super\.onNewIntent\(\1\)\s*\n/;
  if (newIntent.test(contents)) {
    contents = contents.replace(newIntent, (m, name, ind) => `${m}${ind}applyCallLockScreen(${name})\n`);
  } else {
    contents = contents.replace(
      /\n}\s*$/,
      `\n\n  override fun onNewIntent(intent: Intent) {\n    super.onNewIntent(intent)\n    applyCallLockScreen(intent)\n  }\n}\n`
    );
  }
  return contents.replace(/\n}\s*$/, `\n${hook}}\n`);
}

function withCallLockScreen(config) {
  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      patchIncomingCallActivity(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      console.warn('[withCallLockScreen] MainActivity is not Kotlin; skipped');
      return modConfig;
    }
    modConfig.modResults.contents = addMainActivityHook(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withCallLockScreen;
module.exports.patchIncomingCallActivity = patchIncomingCallActivity;
module.exports.addMainActivityHook = addMainActivityHook;
