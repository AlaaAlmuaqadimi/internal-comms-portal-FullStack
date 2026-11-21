/**
 * Phone notifications that are not calls (Phase D): today only "missed call".
 *
 * The server sends missed calls as FCM notification messages on the
 * `missed-calls` channel (backend/src/modules/push/callPush.js). With the app
 * closed or in the background Android shows them by itself; this file
 * creates the channel (name and importance the user sees in Settings) and
 * lets expo-notifications show them while the app is open too.
 *
 * Safe without the native module (Expo Go, tests): every call is a no-op.
 */
import { Platform } from 'react-native';

export const MISSED_CALL_CHANNEL = 'missed-calls';

let configured = false;

function loadNotifications() {
  try {
    // eslint-disable-next-line global-require
    return require('expo-notifications');
  } catch {
    return null;
  }
}

/** Idempotent; call once the user is signed in. Never throws. */
export async function setupDeviceNotifications(notifications = loadNotifications()) {
  if (configured || !notifications) return false;
  configured = true;
  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync(MISSED_CALL_CHANNEL, {
        name: 'المكالمات الفائتة',
        description: 'مكالمات داخلية لم يتم الرد عليها',
        importance: notifications.AndroidImportance?.HIGH ?? 4,
        // No `sound` key: the channel then uses the phone's default notification
        // sound ('default' here would be read as a missing custom sound file).
        vibrationPattern: [0, 250, 250, 250],
        showBadge: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** For tests. */
export function resetDeviceNotifications() {
  configured = false;
}
