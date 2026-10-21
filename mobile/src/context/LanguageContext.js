import React, { createContext, useContext, useState, useEffect } from 'react';
import { I18nManager, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { translations } from '../i18n/translations';
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);
const LanguageContext = createContext();

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

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState('ar');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const stored = await AsyncStorage.getItem('language');
      const initial = stored === 'ar' || stored === 'en' ? stored : 'ar';
      
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
      
      
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const toggleLanguage = () => {
    const next = language === 'ar' ? 'en' : 'ar';
    setLanguage(next);
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
