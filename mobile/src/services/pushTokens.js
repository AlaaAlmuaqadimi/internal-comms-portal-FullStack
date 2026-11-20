/**
 * Keeps the server's copy of this phone's push token in step (Phase D).
 *
 * The call bridge reports the token (FCM on Android, APNs VoIP on iOS) after
 * sign-in and whenever it rotates; sign-out removes it so a signed-out phone
 * never rings. Failures are ignored: the next sign-in or rotation retries.
 * Never logs the token.
 */

let api = null;
let current = null; // { token, platform } last sent to the server

/** Injected once by the app (and by tests). */
export function configurePushTokens(apiClient) {
  api = apiClient;
}

export function platformOf(type) {
  return type === 'APNS_VOIP' ? 'ios' : 'android';
}

/** Sends the token if it is new for this session. */
export async function registerPushToken(value) {
  if (!api || !value?.token) return false;
  const platform = value.platform || platformOf(value.type);
  if (current && current.token === value.token && current.platform === platform) return true;
  try {
    await api.push.register({ token: value.token, platform });
    current = { token: value.token, platform };
    return true;
  } catch {
    return false;
  }
}

/** Removes this phone's token on the server (sign-out). */
export async function unregisterPushToken() {
  const token = current?.token;
  current = null;
  if (!api || !token) return false;
  try {
    await api.push.unregister(token);
    return true;
  } catch {
    return false;
  }
}

/** Test helper. */
export function resetPushTokens() {
  current = null;
}
