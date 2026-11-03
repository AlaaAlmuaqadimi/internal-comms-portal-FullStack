import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as lightColors, darkColors } from '../constants/colors';

const ThemeContext = createContext();

const THEME_KEY = 'themeMode';
const LEGACY_DARK_KEY = 'darkMode';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Light mode is the default. The saved preference is loaded afterwards so
  // a fresh install always starts in light mode.
  const [themeMode, setThemeModeState] = useState('light');
  const [isRTL, setIsRTL] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedTheme = await AsyncStorage.getItem(THEME_KEY);
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setThemeModeState(storedTheme);
      } else {
        // Migrate the old boolean key used by the first theme draft.
        const legacyDark = await AsyncStorage.getItem(LEGACY_DARK_KEY);
        if (legacyDark !== null) {
          let isDark = false;
          try {
            isDark = JSON.parse(legacyDark) === true;
          } catch {
            isDark = legacyDark === 'true';
          }
          const migrated = isDark ? 'dark' : 'light';
          setThemeModeState(migrated);
          await AsyncStorage.setItem(THEME_KEY, migrated);
          await AsyncStorage.removeItem(LEGACY_DARK_KEY);
        }
      }

      const rtl = await AsyncStorage.getItem('rtl');
      if (rtl !== null) {
        setIsRTL(JSON.parse(rtl));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const setThemeMode = useCallback(async (mode) => {
    const next = mode === 'dark' ? 'dark' : 'light';
    setThemeModeState(next);
    try {
      await AsyncStorage.setItem(THEME_KEY, next);
    } catch (error) {
      console.error('Error saving theme mode:', error);
    }
    return next;
  }, []);

  const isDarkMode = themeMode === 'dark';

  const toggleTheme = useCallback(
    () => setThemeMode(isDarkMode ? 'light' : 'dark'),
    [isDarkMode, setThemeMode]
  );

  const toggleRTL = async () => {
    try {
      const newValue = !isRTL;
      setIsRTL(newValue);
      await AsyncStorage.setItem('rtl', JSON.stringify(newValue));
    } catch (error) {
      console.error('Error saving RTL:', error);
    }
  };

  const value = useMemo(
    () => ({
      colors: isDarkMode ? darkColors : lightColors,
      themeMode,
      isDarkMode,
      isRTL,
      setThemeMode,
      toggleTheme,
      // Backwards-compatible aliases for screens written against the old API.
      toggleDarkMode: toggleTheme,
      toggleRTL,
    }),
    [isDarkMode, themeMode, isRTL, setThemeMode, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
