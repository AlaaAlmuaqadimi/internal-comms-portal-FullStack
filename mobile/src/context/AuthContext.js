import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
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
// keychain/keystore. Only non-sensitive profile data uses AsyncStorage-free
// storage here to keep a single source of truth.
async function persistSession(accessToken, refreshToken, user) {
  setAuthTokens({ accessToken, refreshToken });
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ accessToken, refreshToken }));
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

async function readSession() {
  const rawTokens = await SecureStore.getItemAsync(TOKENS_KEY);
  const rawUser = await SecureStore.getItemAsync(USER_KEY);
  if (!rawTokens || !rawUser) return null;
  try {
    return { tokens: JSON.parse(rawTokens), user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
}

async function clearSession() {
  clearAuthTokens();
  await SecureStore.deleteItemAsync(TOKENS_KEY);
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
          // expired token must not keep the user signed in.
          if (isBackendConfigured()) {
            try {
              const freshUser = await api.auth.me();
              setUser(freshUser);
              await SecureStore.setItemAsync(USER_KEY, JSON.stringify(freshUser));
            } catch {
              await clearSession();
              setUser(null);
              setIsAuthenticated(false);
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
      return { success: false, error: 'validation.missingCredentials' };
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
      return { success: false, error: error.message, code: error.code, status: error.status };
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

  const updateUser = async (updates) => {
    try {
      const updatedUser = { ...user, ...updates };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'mock.errorUpdate' };
    }
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
