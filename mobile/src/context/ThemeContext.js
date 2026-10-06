import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../constants/colors';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRTL, setIsRTL] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const darkMode = await AsyncStorage.getItem('darkMode');
      const rtl = await AsyncStorage.getItem('rtl');
      
      if (darkMode !== null) {
        setIsDarkMode(JSON.parse(darkMode));
      }
      if (rtl !== null) {
        setIsRTL(JSON.parse(rtl));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const toggleDarkMode = async () => {
    try {
      const newValue = !isDarkMode;
      setIsDarkMode(newValue);
      await AsyncStorage.setItem('darkMode', JSON.stringify(newValue));
    } catch (error) {
      console.error('Error saving dark mode:', error);
    }
  };

  const toggleRTL = async () => {
    try {
      const newValue = !isRTL;
      setIsRTL(newValue);
      await AsyncStorage.setItem('rtl', JSON.stringify(newValue));
    } catch (error) {
      console.error('Error saving RTL:', error);
    }
  };

  const theme = {
    colors: isDarkMode ? darkColors : colors,
    isDarkMode,
    isRTL,
    toggleDarkMode,
    toggleRTL,
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

// ألوان الوضع الداكن
const darkColors = {
  ...colors,
  background: '#0f172a',
  surface: '#1e293b',
  surfaceDark: '#0f172a',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textLight: '#64748b',
  border: '#334155',
  borderDark: '#475569',
  primary: '#f1f5f9',
  primaryLight: '#3b82f6',
  overlay: 'rgba(0, 0, 0, 0.7)',
};
