import Constants from 'expo-constants';
import { translate } from '../context/LanguageContext';
import { createAuthedRequest, createRefresher } from './authRefresh';

// API base URL - set via EXPO_PUBLIC_API_BASE_URL in mobile/.env
// (Expo only inlines env vars prefixed with EXPO_PUBLIC_ into the client
// bundle; a plain API_BASE_URL is undefined on the device.)
// For local development: EXPO_PUBLIC_API_BASE_URL=http://<your-machine-ip>:4000
// A trailing slash is stripped so `base + '/api/...'` never yields '//api/...'.
const getDevUrl = () => {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : '';
};

const RAW_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || getDevUrl();
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');

export const isBackendConfigured = () => !!API_BASE_URL && API_BASE_URL.trim() !== '';

/** Base URL without a trailing slash, e.g. for the signalling socket. */
export const getApiBaseUrl = () => API_BASE_URL;

// Error carrying the HTTP status and the API error code so callers can react
// (e.g. distinguish 401 invalid credentials from a network failure).
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshToken = null;
let onUnauthorized = null;
let onTokensRefreshed = null;

export function setAuthTokens(tokens) {
  accessToken = tokens?.accessToken || null;
  refreshToken = tokens?.refreshToken || null;
}

export function clearAuthTokens() {
  accessToken = null;
  refreshToken = null;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * Called after a successful refresh with `{ accessToken, refreshToken, user }`
 * so the new tokens can be saved to secure storage. The tokens are already in
 * memory when it runs.
 */
export function setTokensRefreshedHandler(handler) {
  onTokensRefreshed = handler;
}

function getLocalizedAuthError(code, fallback) {
  try {
    const localized = translate(`authErrors.${code}`);
    if (localized && localized !== `authErrors.${code}`) {
      return localized;
    }
  } catch {
    // fall through to fallback
  }
  if (fallback && typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  try {
    const generic = translate('login.error');
    if (generic && generic !== 'login.error') return generic;
  } catch {
    // ignore
  }
  return 'حدث خطأ';
}

// Low-level request. Throws ApiError on network failure or non-2xx response -
// it never silently degrades to mock mode. 401 handling (refresh, sign-out)
// lives in `request` below.
const rawRequest = async (endpoint, options = {}) => {
  if (!isBackendConfigured()) {
    const code = 'NOT_CONFIGURED';
    throw new ApiError(
      getLocalizedAuthError(
        code,
        'The API is not configured. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env.'
      ),
      { status: 0, code }
    );
  }

  const { auth = true, headers, timeout, ...rest } = options;
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = timeout ?? 10000;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...rest,
      headers: finalHeaders,
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    const code = controller && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw new ApiError(
      getLocalizedAuthError(code, translate('login.networkError')),
      { status: 0, code, details: error.message }
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const code = data?.code || 'HTTP_ERROR';
    throw new ApiError(getLocalizedAuthError(code, data?.error), {
      status: response.status,
      code,
      details: data?.details || null,
    });
  }

  return { data, status: response.status };
};

// One refresh at a time: the server revokes the whole session if the same
// refresh token is used twice.
const refreshSession = createRefresher({
  getRefreshToken: () => refreshToken,
  callRefresh: async (token) => {
    const { data } = await rawRequest('/api/auth/refresh', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ refreshToken: token }),
    });
    return data;
  },
  onRefreshed: async (result) => {
    setAuthTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    try {
      await onTokensRefreshed?.(result);
    } catch {
      // Saving failed: the in-memory session still works until the app closes.
    }
  },
});

// Every API call: on an expired access token, refresh once and retry. Signs
// out only when the server rejects the session, never on a network error.
const request = createAuthedRequest({
  rawRequest,
  getAccessToken: () => accessToken,
  getRefreshToken: () => refreshToken,
  refresh: refreshSession,
  onUnauthorized: () => onUnauthorized?.(),
});


export const api = {
  // Authentication
  auth: {
    login: async (username, password) => {
      const { data } = await request('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ username, password }),
      });
      return {
        success: true,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
    },

    // Authenticated user creation. Requires the caller to hold users.manage.
    createUser: async (userData) => {
      const { data } = await request('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      return { success: true, user: data.user };
    },

    listRoles: async () => {
      const { data } = await request('/api/users/roles');
      return data.roles;
    },

    listOrgUnits: async () => {
      const { data } = await request('/api/users/org-units');
      return data.orgUnits;
    },

    // Username preview for the Add Employee form. The server derives a unique
    // value from the English name and appends a numeric suffix on collision.
    previewUsername: async (fullNameEn) => {
      const { data } = await request('/api/users/preview-username', {
        method: 'POST',
        body: JSON.stringify({ fullNameEn }),
      });
      return data.username;
    },

    // Pre-submit uniqueness check for email / extension / username. Edit mode
    // passes the current employee id so its own values stay "available".
    checkAvailability: async (field, value, { excludeEmployeeId } = {}) => {
      const params = [
        `field=${encodeURIComponent(field)}`,
        `value=${encodeURIComponent(value)}`,
      ];
      if (excludeEmployeeId) {
        params.push(`excludeEmployeeId=${encodeURIComponent(excludeEmployeeId)}`);
      }
      const { data } = await request(`/api/users/availability?${params.join('&')}`);
      return { available: data.available, field: data.field, value: data.value };
    },

    me: async () => {
      const { data } = await request('/api/auth/me');
      return data.user;
    },

    register: async (userData) => {
      const { data } = await request('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: JSON.stringify(userData),
      });
      return {
        success: true,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
    },

    logout: async () => {
      try {
        await request('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Best-effort: the client clears local state regardless.
      }
      return { success: true };
    },
  },

  // Employees
  employees: {
    // Server-side search across name (AR/EN), username, email and extension.
    // Role, org-unit and status filters are applied in SQL; the org-unit filter
    // also includes every descendant unit.
    list: async ({ q, roleCode, orgUnitId, status } = {}) => {
      const params = [];
      if (q) params.push(`q=${encodeURIComponent(q)}`);
      if (roleCode) params.push(`roleCode=${encodeURIComponent(roleCode)}`);
      if (orgUnitId) params.push(`orgUnitId=${encodeURIComponent(orgUnitId)}`);
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      const query = params.length ? `?${params.join('&')}` : '';
      const { data } = await request(`/api/employees${query}`, { timeout: 30000 });
      return data.employees;
    },

    // Alias kept for the Settings screen, which loads the whole directory.
    getAll: async () => {
      const { data } = await request('/api/employees', { timeout: 30000 });
      return data.employees;
    },

    getById: async (id) => {
      const { data } = await request(`/api/employees/${id}`);
      return data.employee;
    },

    listRoles: async () => {
      const { data } = await request('/api/employees/roles');
      return data.roles;
    },

    update: async (id, payload) => {
      const { data } = await request(`/api/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return { success: data.success, employee: data.employee };
    },
  },

  // Calls
  calls: {
    getAll: async () => {
      const { data } = await request('/api/calls');
      return data;
    },

    getById: async (id) => {
      const { data } = await request(`/api/calls/${id}`);
      return data;
    },

    invite: async ({ calleeEmployeeId, callType = 'audio' }) => {
      const { data } = await request('/api/calls', {
        method: 'POST',
        body: JSON.stringify({ calleeEmployeeId, callType }),
      });
      return data.call;
    },

    accept: async (id) => {
      const { data } = await request(`/api/calls/${id}/accept`, { method: 'POST' });
      return data.call;
    },

    decline: async (id) => {
      const { data } = await request(`/api/calls/${id}/decline`, { method: 'POST' });
      return data.call;
    },

    cancel: async (id) => {
      const { data } = await request(`/api/calls/${id}/cancel`, { method: 'POST' });
      return data.call;
    },

    end: async (id) => {
      const { data } = await request(`/api/calls/${id}/end`, { method: 'POST' });
      return data.call;
    },

    // Phase B: one-time ticket for the signalling socket. 404
    // CALL_SIGNALING_DISABLED while the server flag is off.
    signalingTicket: async () => {
      const { data } = await request('/api/calls/signaling/ticket', { method: 'POST' });
      return data;
    },

    markMissed: async (id) => {
      const { data } = await request(`/api/calls/${id}/missed`, { method: 'POST' });
      return data.call;
    },
  },

  // Phase D: this phone's push token, so a call rings even when the app is
  // closed (FCM on Android, APNs VoIP on iOS).
  push: {
    register: async ({ token, platform }) => {
      const { data } = await request('/api/push/tokens', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      });
      return data;
    },
    unregister: async (token) => {
      const { data } = await request('/api/push/tokens', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      });
      return data;
    },
  },

  // Notifications
  notifications: {
    // Returns the notifications that were delivered to the signed-in employee
    // plus the unread count used by the tab badge.
    getAll: async () => {
      const { data } = await request('/api/notifications');
      return {
        notifications: Array.isArray(data?.notifications) ? data.notifications : [],
        unreadCount:
          typeof data?.unreadCount === 'number'
            ? data.unreadCount
            : (data?.notifications || []).filter((item) => item.unread).length,
      };
    },

    getUnreadCount: async () => {
      const { data } = await request('/api/notifications/unread-count');
      return Number(data?.count || 0);
    },

    create: async (payload) => {
      const { data } = await request('/api/notifications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.notification;
    },

    getReceipts: async (id) => {
      const { data } = await request(`/api/notifications/${id}/receipts`);
      return {
        recipientCount: Number(data?.recipientCount || 0),
        readCount: Number(data?.readCount || 0),
        recipients: Array.isArray(data?.recipients) ? data.recipients : [],
      };
    },

    markAsRead: async (id) => {
      const { data } = await request(`/api/notifications/${id}/read`, { method: 'POST' });
      return { success: data.success };
    },

    markAllAsRead: async () => {
      const { data } = await request('/api/notifications/read-all', { method: 'POST' });
      return { success: data.success };
    },
  },

  // Org structure
  org: {
    // Returns a forest (array of root nodes) with nested `children`.
    getTree: async ({ rootId, includeInactive = false } = {}) => {
      // Build the query manually: React Native's URLSearchParams support
      // varies between platforms and engines.
      const params = [];
      if (rootId) params.push(`rootId=${encodeURIComponent(rootId)}`);
      if (includeInactive) params.push('includeInactive=true');
      const query = params.length ? `?${params.join('&')}` : '';
      const { data } = await request(`/api/org-units/tree${query}`);
      return data.tree;
    },

    // Flat, scope-aware list.
    listUnits: async () => {
      const { data } = await request('/api/org-units');
      return data.orgUnits;
    },

    addUnit: async (unitData) => {
      const { data } = await request('/api/org-units', {
        method: 'POST',
        body: JSON.stringify(unitData),
      });
      return { success: data.success, orgUnit: data.orgUnit };
    },

    updateUnit: async (id, unitData) => {
      const { data } = await request(`/api/org-units/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(unitData),
      });
      return { success: data.success, orgUnit: data.orgUnit };
    },

    moveUnit: async (id, parentId) => {
      const { data } = await request(`/api/org-units/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId }),
      });
      return { success: data.success, orgUnit: data.orgUnit };
    },

    deleteUnit: async (id) => {
      const { data } = await request(`/api/org-units/${id}`, { method: 'DELETE' });
      return { success: data.success, deleted: data.deleted };
    },

    restoreUnit: async (id) => {
      const { data } = await request(`/api/org-units/${id}/restore`, { method: 'POST' });
      return { success: data.success, orgUnit: data.orgUnit };
    },
  },

  // Kitchens
  kitchens: {
    getAll: async () => {
      const { data } = await request('/api/kitchens');
      return data.kitchens || [];
    },

    getByUnit: async (unitId) => {
      const { data } = await request(`/api/kitchens?unitId=${encodeURIComponent(unitId)}`);
      return data.kitchens || [];
    },
  },

  // Settings
  settings: {
    updateProfile: async (userData) => {
      const { data } = await request('/api/auth/update', {
        method: 'PUT',
        timeout: 60000,
        body: JSON.stringify(userData),
      });
      return { success: data.success, user: data.user };
    },

    updateContacts: async (contacts) => {
      const { data } = await request('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ contacts }),
      });
      return { success: data.success, user: data.user };
    },

    updateKitchen: async (kitchenId) => {
      const { data } = await request('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ kitchenChoice: kitchenId }),
      });
      return { success: data.success, user: data.user };
    },

    // Administrator-editable application settings (call redaction labels).
    getAppSettings: async () => {
      const { data } = await request('/api/settings/app');
      return { settings: data.settings || {}, items: data.items || [] };
    },

    updateAppSettings: async (settings) => {
      const { data } = await request('/api/settings/app', {
        method: 'PATCH',
        body: JSON.stringify({ settings }),
      });
      return { settings: data.settings || {}, items: data.items || [] };
    },
  },
};

// Check if running with real backend
export const checkBackendStatus = async () => {
  if (!isBackendConfigured()) {
    return { real: false, message: 'Backend not configured' };
  }
  try {
    const user = await api.auth.me();
    return { real: true, connected: true, user };
  } catch (error) {
    return { real: true, connected: false, error: error.message };
  }
};

// Convenience flag
export const isUsingRealBackend = () => isBackendConfigured();

export default api;