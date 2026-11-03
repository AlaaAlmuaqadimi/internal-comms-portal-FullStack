import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api,
  setAuthTokens,
  clearAuthTokens,
  setUnauthorizedHandler,
  isBackendConfigured,
} from '../services/api';

const AuthContext = createContext();

const TOKENS_KEY = 'auth.tokens';
const USER_KEY = 'auth.user';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Refresh tokens are long-lived credentials, so they go in the platform
// keychain/keystore. The profile (which may include a large avatar data URL)
// is not a credential and is stored in AsyncStorage, where it is not limited to
// SecureStore's small per-value payload size.
//
// Photos picked on the device are cached as base64 data URLs. They are
// downscaled before upload, but a very large value must not be written to the
// profile cache because some storage backends limit the size of a single row.
// Small avatars are kept so they survive an offline launch.
const MAX_CACHED_AVATAR = 500_000;
function sanitizeUserForStorage(user) {
  if (!user || typeof user !== 'object') return user;
  const cached = { ...user };
  for (const key of ['avatar', 'avatarUrl']) {
    const value = cached[key];
    if (
      typeof value === 'string' &&
      value.startsWith('data:') &&
      value.length > MAX_CACHED_AVATAR
    ) {
      delete cached[key];
    }
  }
  return cached;
}

async function persistSession(accessToken, refreshToken, user) {
  setAuthTokens({ accessToken, refreshToken });
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ accessToken, refreshToken }));
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(sanitizeUserForStorage(user)));
}

async function readSession() {
  const rawTokens = await SecureStore.getItemAsync(TOKENS_KEY);
  if (!rawTokens) return null;

  let rawUser = await AsyncStorage.getItem(USER_KEY);

  // Migrate sessions created before the profile moved out of SecureStore.
  if (!rawUser) {
    rawUser = await SecureStore.getItemAsync(USER_KEY);
    if (rawUser) {
      await AsyncStorage.setItem(USER_KEY, rawUser);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  }

  if (!rawUser) return null;

  try {
    return { tokens: JSON.parse(rawTokens), user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
}

async function clearSession() {
  clearAuthTokens();
  await SecureStore.deleteItemAsync(TOKENS_KEY);
  await AsyncStorage.removeItem(USER_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleUnauthorized = useCallback(async () => {
    await clearSession();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
  }, [handleUnauthorized]);

  useEffect(() => {
    (async () => {
      try {
        const session = await readSession();
        if (session) {
          setAuthTokens(session.tokens);
          setUser(session.user);
          setIsAuthenticated(true);

          // Validate the stored session against the server; a revoked or
          // expired token must not keep the user signed in. A network failure
          // keeps the cached session so the app still opens offline.
          if (isBackendConfigured()) {
            try {
              const freshUser = await api.auth.me();
              setUser(freshUser);
              await AsyncStorage.setItem(
                USER_KEY,
                JSON.stringify(sanitizeUserForStorage(freshUser))
              );
            } catch (error) {
              if (error?.status === 401) {
                await clearSession();
                setUser(null);
                setIsAuthenticated(false);
              }
            }
          }
        }
      } catch {
        await clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username, password) => {
    const trimmedUsername = (username || '').trim();

    if (!trimmedUsername || !password) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    try {
      const result = await api.auth.login(trimmedUsername, password);
      await persistSession(result.accessToken, result.refreshToken, result.user);
      setUser(result.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message, code: error.code, status: error.status };
    }
  };

  const register = async (userData) => {
    try {
      const result = await api.auth.register(userData);
      await persistSession(result.accessToken, result.refreshToken, result.user);
      setUser(result.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'حدث خطأ أثناء إنشاء الحساب', code: error.code, status: error.status };
    }
  };

  // Authenticated user creation. Throws on failure so the form can show the
  // server error; the caller must already hold users.manage.
  const createUser = async (userData) => {
    const created = await api.auth.createUser(userData);
    return created.user;
  };

  const logout = async () => {
    await api.auth.logout();
    await clearSession();
    setUser(null);
    setIsAuthenticated(false);
  };

  // Persists profile/preference changes. When a backend is configured the
  // server is the source of truth and its canonical user object is stored;
  // otherwise the change is kept locally so the settings preview still works.
  // `localOnly` is used by screens that know a value only exists in their
  // fallback data (for example a mocked kitchen or org unit), so it can still
  // update the preview without sending an invalid id to the API.
  const updateUser = async (updates, options = {}) => {
    try {
      const normalized = { ...updates };
      if (normalized.fullNameAr !== undefined && normalized.name === undefined) {
        normalized.name = normalized.fullNameAr;
      }
      if (normalized.avatarUrl !== undefined && normalized.avatar === undefined) {
        normalized.avatar = normalized.avatarUrl;
      }

      let updatedUser = { ...user, ...normalized };

      if (!options.localOnly && isBackendConfigured()) {
        const result = await api.settings.updateProfile(updates);
        if (result?.user) updatedUser = result.user;
      }

      await AsyncStorage.setItem(
        USER_KEY,
        JSON.stringify(sanitizeUserForStorage(updatedUser))
      );
      setUser(updatedUser);
      return { success: true, user: updatedUser };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'mock.errorUpdate',
        code: error.code,
        status: error.status,
      };
    }
  };

  const refreshUser = async () => {
    if (!isBackendConfigured()) return user;
    const fresh = await api.auth.me();
    await AsyncStorage.setItem(
      USER_KEY,
      JSON.stringify(sanitizeUserForStorage(fresh))
    );
    setUser(fresh);
    return fresh;
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    createUser,
    logout,
    updateUser,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
