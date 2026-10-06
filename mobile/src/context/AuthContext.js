import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      // محاكاة تسجيل الدخول - في التطبيق الحقيقي سيتم الاتصال بالخادم
      if (username && password) {
        const userData = {
          id: '1',
          name: 'أحمد محمد',
          username: username,
          management: 'إدارة تقنية المعلومات',
          unitName: 'قسم البرمجيات',
          path: 'مصلحة الضرائب / إدارة تقنية المعلومات / قسم البرمجيات',
          status: 'online',
        };
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: 'بيانات الدخول غير صحيحة' };
    } catch (error) {
      return { success: false, error: 'حدث خطأ أثناء تسجيل الدخول' };
    }
  };

  const register = async (userData) => {
    try {
      // محاكاة إنشاء حساب - في التطبيق الحقيقي سيتم الاتصال بالخادم
      const newUser = {
        id: Date.now().toString(),
        ...userData,
        status: 'online',
      };
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      setIsAuthenticated(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'حدث خطأ أثناء إنشاء الحساب' };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const updateUser = async (updates) => {
    try {
      const updatedUser = { ...user, ...updates };
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'حدث خطأ أثناء تحديث البيانات' };
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
