import Constants from 'expo-constants';
import { translate } from '../context/LanguageContext';

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
// it never silently degrades to mock mode.
const request = async (endpoint, options = {}) => {
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

  const { auth = true, headers, ...rest } = options;
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = 10000;
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

  if (response.status === 401 && auth && onUnauthorized) {
    onUnauthorized();
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
    getAll: async () => {
      const { data } = await request('/api/employees');
      return data;
    },

    getById: async (id) => {
      const { data } = await request(`/api/employees/${id}`);
      return data;
    },

    search: async (query) => {
      const { data } = await request(`/api/employees/search?q=${encodeURIComponent(query)}`);
      return data;
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
  },

  // Notifications
  notifications: {
    getAll: async () => {
      const { data } = await request('/api/notifications');
      return data;
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
      return data;
    },

    getByUnit: async (unitId) => {
      const { data } = await request(`/api/kitchens?unitId=${encodeURIComponent(unitId)}`);
      return data;
    },
  },

  // Settings
  settings: {
    updateProfile: async (userData) => {
      const { data } = await request('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify(userData),
      });
      return { success: data.success };
    },

    updateContacts: async (contacts) => {
      await request('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ contacts }),
      });
      return { success: true };
    },

    updateKitchen: async (kitchenId) => {
      await request('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ kitchenChoice: kitchenId }),
      });
      return { success: true };
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