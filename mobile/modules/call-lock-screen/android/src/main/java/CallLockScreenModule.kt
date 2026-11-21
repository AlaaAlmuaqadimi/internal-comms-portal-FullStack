package expo.modules.calllockscreen

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Lets the live call show over the lock screen, like the phone's own dialer.
 *
 * On while a call is connecting or active, off as soon as it ends: then the
 * app falls back behind the lock screen and the rest of the app still needs
 * the PIN. Turned on natively at answer time by plugins/withCallLockScreen.js
 * (so it shows at once), and kept in step with the call by CallContext.
 */
class CallLockScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLockScreen")

    Function("setShowOverLock") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread { apply(activity, on) }
      true
    }
  }

  private fun apply(activity: Activity, on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(on)
      activity.setTurnScreenOn(on)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
    }
  }
}
