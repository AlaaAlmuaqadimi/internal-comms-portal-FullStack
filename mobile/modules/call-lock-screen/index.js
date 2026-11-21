/**
 * Show the live call over the lock screen (Android). No-op where the native
 * module is missing (Expo Go, iPhone, tests).
 */
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule('CallLockScreen');

export function setShowOverLock(on) {
  try {
    return Boolean(native?.setShowOverLock(Boolean(on)));
  } catch {
    return false;
  }
}

export const isAvailable = Boolean(native);
