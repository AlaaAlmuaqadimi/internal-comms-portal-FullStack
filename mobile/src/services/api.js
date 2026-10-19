import { translate } from '../context/LanguageContext';

// API base URL - set via environment variable
// For local development with real backend: API_BASE_URL=http://localhost:4000
// For production or mock mode: leave unset or set to empty
const API_BASE_URL = process.env.API_BASE_URL || '';

const useRealBackend = !!API_BASE_URL && API_BASE_URL.trim() !== '';

// Base delay for mock responses when not using real backend
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to make API calls
const fetchApi = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  if (!useRealBackend) {
    // Mock mode - return null to indicate use mock data
    return { useRealBackend: false };
  }

  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  try {
    const response = await fetch(url, defaultOptions);
    const data = await response.json();
    return { useRealBackend: true, data, status: response.status };
  } catch (error) {
    return { useRealBackend: false, error: error.message };
  }
};

export const api = {
  // Authentication
  auth: {
    login: async (username, password) => {
      const result = await fetchApi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (!result.useRealBackend) {
        // Mock implementation
        await delay(1000);
        if (username && password) {
          return {
            success: true,
            user: {
              id: '1',
              name: translate('mock.defaultUserName'),
              username,
              management: translate('mock.itDept'),
              unitName: translate('mock.software'),
              path: `${translate('mock.orgName')} / ${translate('mock.itDept')} / ${translate('mock.software')}`,
              status: 'online',
            },
          };
        }
        throw new Error(translate('login.invalidCredentials'));
      }

      if (!result.data.success) {
        throw new Error(result.data.error || translate('login.invalidCredentials'));
      }
      return { success: true, user: result.data.user };
    },

    register: async (userData) => {
      const result = await fetchApi('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      if (!result.useRealBackend) {
        await delay(1500);
        return {
          success: true,
          user: {
            id: Date.now().toString(),
            ...userData,
            status: 'online',
          },
        };
      }

      if (!result.data.success) {
        throw new Error(result.data.error || translate('mock.errorCreateAccount'));
      }
      return { success: true, user: result.data.user };
    },

    logout: async () => {
      if (!useRealBackend) {
        await delay(500);
        return { success: true };
      }
      const result = await fetchApi('/api/auth/logout', {
        method: 'POST',
      });
      return { success: result.data.success };
    },
  },

  // Employees
  employees: {
    getAll: async () => {
      const result = await fetchApi('/api/employees');
      if (!result.useRealBackend) {
        await delay(800);
        return []; // Will be populated by screen's own mockData
      }
      return result.data;
    },

    getById: async (id) => {
      const result = await fetchApi(`/api/employees/${id}`);
      if (!result.useRealBackend) {
        await delay(500);
        return null;
      }
      return result.data;
    },

    search: async (query) => {
      const result = await fetchApi(`/api/employees/search?q=${query}`);
      if (!result.useRealBackend) {
        await delay(600);
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        // Would query DB in real app
        return [];
      }
      return result.data;
    },
  },

  // Calls
  calls: {
    getAll: async () => {
      const result = await fetchApi('/api/calls');
      if (!result.useRealBackend) {
        await delay(800);
        return [];
      }
      return result.data;
    },

    getById: async (id) => {
      const result = await fetchApi(`/api/calls/${id}`);
      if (!result.useRealBackend) {
        await delay(500);
        return null;
      }
      return result.data;
    },
  },

  // Notifications
  notifications: {
    getAll: async () => {
      const result = await fetchApi('/api/notifications');
      if (!result.useRealBackend) {
        await delay(800);
        return [];
      }
      return result.data;
    },

    markAsRead: async (id) => {
      if (!useRealBackend) {
        await delay(300);
        return { success: true };
      }
      const result = await fetchApi(`/api/notifications/${id}/read`, {
        method: 'POST',
      });
      return { success: result.data.success };
    },

    markAllAsRead: async () => {
      if (!useRealBackend) {
        await delay(500);
        return { success: true };
      }
      const result = await fetchApi('/api/notifications/read-all', {
        method: 'POST',
      });
      return { success: result.data.success };
    },
  },

  // Org structure
  org: {
    getTree: async () => {
      const result = await fetchApi('/api/org/tree');
      if (!result.useRealBackend) {
        await delay(800);
        return [];
      }
      return result.data;
    },

    addUnit: async (unitData) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true, id: Date.now().toString() };
      }
      const result = await fetchApi('/api/org/unit', {
        method: 'POST',
        body: JSON.stringify(unitData),
      });
      return { success: result.data.success, id: result.data.id };
    },

    updateUnit: async (id, unitData) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true };
      }
      await fetchApi(`/api/org/unit/${id}`, {
        method: 'PUT',
        body: JSON.stringify(unitData),
      });
      return { success: true };
    },

    deleteUnit: async (id) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true };
      }
      await fetchApi(`/api/org/unit/${id}`, { method: 'DELETE' });
      return { success: true };
    },
  },

  // Kitchens
  kitchens: {
    getAll: async () => {
      const result = await fetchApi('/api/kitchens');
      if (!result.useRealBackend) {
        await delay(800);
        return [];
      }
      return result.data;
    },

    getByUnit: async (unitId) => {
      const result = await fetchApi(`/api/kitchens?unitId=${unitId}`);
      if (!result.useRealBackend) {
        await delay(500);
        return [];
      }
      return result.data;
    },
  },

  // Settings
  settings: {
    updateProfile: async (userData) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true };
      }
      const result = await fetchApi('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify(userData),
      });
      return { success: result.data.success };
    },

    updateContacts: async (contacts) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true };
      }
      await fetchApi('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ contacts }),
      });
      return { success: true };
    },

    updateKitchen: async (kitchenId) => {
      if (!useRealBackend) {
        await delay(1000);
        return { success: true };
      }
      await fetchApi('/api/auth/update', {
        method: 'PUT',
        body: JSON.stringify({ kitchenChoice: kitchenId }),
      });
      return { success: true };
    },
  },
};

// Check if running with real backend
export const checkBackendStatus = async () => {
  if (!useRealBackend) {
    return { real: false, message: 'Using mock data' };
  }
  try {
    const result = await fetchApi('/api/auth/me');
    if (!result.useRealBackend) {
      return { real: false, message: 'Using mock data' };
    }
    return { real: true, connected: true, user: result.data.user };
  } catch (error) {
    return { real: true, connected: false, error: error.message };
  }
};

// Convenience flag
export const isUsingRealBackend = () => useRealBackend;

export default api;