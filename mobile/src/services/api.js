import { translate } from '../context/LanguageContext';

// API base URL - set via EXPO_PUBLIC_API_BASE_URL in mobile/.env
// (Expo only inlines env vars prefixed with EXPO_PUBLIC_ into the client
// bundle; a plain API_BASE_URL is undefined on the device.)
// For local development: EXPO_PUBLIC_API_BASE_URL=http://<your-machine-ip>:4000
// A trailing slash is stripped so `base + '/api/...'` never yields '//api/...'.
const RAW_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '';
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

// Low-level request. Throws ApiError on network failure or non-2xx response -
// it never silently degrades to mock mode.
const request = async (endpoint, options = {}) => {
  if (!isBackendConfigured()) {
    throw new ApiError(
      'The API is not configured. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env.',
      { status: 0, code: 'NOT_CONFIGURED' }
    );
  }

  const { auth = true, headers, ...rest } = options;
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...rest, headers: finalHeaders });
  } catch (error) {
    throw new ApiError(translate('login.networkError'), { status: 0, code: 'NETWORK', details: error.message });
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
    throw new ApiError(data?.error || translate('login.error'), {
      status: response.status,
      code: data?.code || 'HTTP_ERROR',
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
    getTree: async () => {
      const { data } = await request('/api/org/tree');
      return data;
    },

    addUnit: async (unitData) => {
      const { data } = await request('/api/org/unit', {
        method: 'POST',
        body: JSON.stringify(unitData),
      });
      return { success: data.success, id: data.id };
    },

    updateUnit: async (id, unitData) => {
      await request(`/api/org/unit/${id}`, {
        method: 'PUT',
        body: JSON.stringify(unitData),
      });
      return { success: true };
    },

    deleteUnit: async (id) => {
      await request(`/api/org/unit/${id}`, { method: 'DELETE' });
      return { success: true };
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