// خدمة API - محاكاة الاتصال بالخادم
import { translate } from '../context/LanguageContext';
// في التطبيق الحقيقي سيتم استبدال هذا بطلبات HTTP حقيقية

import { mockData } from '../utils/mockData';

// محاكاة تأخير الشبكة
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // المصادقة
  auth: {
    login: async (username, password) => {
      await delay(1000);
      // محاكاة نجاح تسجيل الدخول
      if (username && password) {
        return {
          success: true,
          user: {
            id: '1',
            name: 'أحمد محمد',
            username: username,
            management: 'إدارة تقنية المعلومات',
            unitName: 'قسم البرمجيات',
            path: 'مصلحة الضرائب / إدارة تقنية المعلومات / قسم البرمجيات',
            status: 'online',
          },
        };
      }
      throw new Error(translate('login.invalidCredentials'));
    },

    register: async (userData) => {
      await delay(1500);
      return {
        success: true,
        user: {
          id: Date.now().toString(),
          ...userData,
          status: 'online',
        },
      };
    },

    logout: async () => {
      await delay(500);
      return { success: true };
    },
  },

  // الموظفين
  employees: {
    getAll: async () => {
      await delay(800);
      return mockData.employees;
    },

    getById: async (id) => {
      await delay(500);
      return mockData.employees.find(emp => emp.id === id);
    },

    search: async (query) => {
      await delay(600);
      if (!query) return mockData.employees;
      const lowerQuery = query.toLowerCase();
      return mockData.employees.filter(emp => 
        emp.name.toLowerCase().includes(lowerQuery) ||
        emp.management.toLowerCase().includes(lowerQuery) ||
        emp.unitName.toLowerCase().includes(lowerQuery)
      );
    },
  },

  // المكالمات
  calls: {
    getAll: async () => {
      await delay(800);
      return mockData.calls;
    },

    getById: async (id) => {
      await delay(500);
      return mockData.calls.find(call => call.id === id);
    },
  },

  // الإشعارات
  notifications: {
    getAll: async () => {
      await delay(800);
      return mockData.notifications;
    },

    markAsRead: async (id) => {
      await delay(300);
      return { success: true };
    },

    markAllAsRead: async () => {
      await delay(500);
      return { success: true };
    },
  },

  // الهيكل الإداري
  org: {
    getTree: async () => {
      await delay(800);
      return mockData.orgTree;
    },

    addUnit: async (unitData) => {
      await delay(1000);
      return { success: true, id: Date.now().toString() };
    },

    updateUnit: async (id, unitData) => {
      await delay(1000);
      return { success: true };
    },

    deleteUnit: async (id) => {
      await delay(1000);
      return { success: true };
    },
  },

  // المطابخ
  kitchens: {
    getAll: async () => {
      await delay(800);
      return mockData.kitchens;
    },

    getByUnit: async (unitId) => {
      await delay(500);
      return mockData.kitchens.filter(k => k.unitId === unitId);
    },
  },

  // الإعدادات
  settings: {
    updateProfile: async (userData) => {
      await delay(1000);
      return { success: true };
    },

    updateContacts: async (contacts) => {
      await delay(1000);
      return { success: true };
    },

    updateKitchen: async (kitchenId) => {
      await delay(1000);
      return { success: true };
    },
  },
};

export default api;
