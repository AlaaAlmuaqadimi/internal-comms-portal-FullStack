import React, { createContext, useContext, useState, useEffect } from 'react';
import { I18nManager, Alert, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { translations } from '../i18n/translations';

const LanguageContext = createContext();

// لغة حالية على مستوى الوحدة لاستخدامها في الوحدات غير المكونية (validation, formatters, mockData helpers)
let currentLanguage = 'ar';

export const getCurrentLanguage = () => currentLanguage;

export const translate = (key, params) => {
  const lang = currentLanguage;
  const lookup = (l) =>
    key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), translations[l]);
  let text = lookup(lang);
  if (text === undefined) text = lookup('ar');
  if (text === undefined) return key;
  if (params && typeof text === 'string') {
    Object.keys(params).forEach((p) => {
      text = text.replace(new RegExp(`{{${p}}}`, 'g'), String(params[p]));
    });
  }
  return text;
};

export const setModuleLanguage = (lang) => {
  currentLanguage = lang;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

I18nManager.allowRTL(true);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try {
      const locs = getLocales();
      return locs && locs.length > 0 && locs[0].languageCode === 'ar' ? 'ar' : 'en';
    } catch (e) {
      return 'ar';
    }
  });

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const stored = await AsyncStorage.getItem('language');
      if (stored === 'ar' || stored === 'en') {
        setLanguageState(stored);
        setModuleLanguage(stored);
        const wantRTL = stored === 'ar';
        if (I18nManager.isRTL !== wantRTL) {
          I18nManager.forceRTL(wantRTL);
          setTimeout(() => DevSettings.reload(), 100);
        }
        return;
      }
      const locales = getLocales();
      const initial = locales && locales.length > 0 && locales[0].languageCode === 'ar' ? 'ar' : 'en';
      setLanguageState(initial);
      setModuleLanguage(initial);
    } catch (error) {
      console.error('Error loading language:', error);
    }
  };

  const setLanguage = async (lang) => {
    try {
      setLanguageState(lang);
      setModuleLanguage(lang);
      await AsyncStorage.setItem('language', lang);
      const wantRTL = lang === 'ar';
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.forceRTL(wantRTL);
        setTimeout(() => DevSettings.reload(), 300);
      }
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const toggleLanguage = () => {
    const next = language === 'ar' ? 'en' : 'ar';
    setLanguage(next);
    Alert.alert(
      next === 'ar' ? 'تم تغيير اللغة' : 'Language Changed',
      translations[next].settings.reloadMessage,
      [{ text: 'OK' }]
    );
  };

  const t = (key, params) => {
    const lookup = (l) =>
      key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), translations[l]);
    let text = lookup(language);
    if (text === undefined) text = lookup('ar');
    if (text === undefined) return key;
    if (params && typeof text === 'string') {
      Object.keys(params).forEach((p) => {
        text = text.replace(new RegExp(`{{${p}}}`, 'g'), String(params[p]));
      });
    }
    return text;
  };

  const isRTL = language === 'ar';

  const value = {
    language,
    isRTL,
    align: isRTL ? 'right' : 'left',
    t,
    toggleLanguage,
    setLanguage,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export default LanguageProvider;
