// أدوات التحقق من صحة البيانات
import { translate } from '../context/LanguageContext';

export const validation = {
  // التحقق من اسم المستخدم
  username: (value) => {
    if (!value || value.trim().length === 0) {
      return translate('validation.usernameRequired');
    }
    if (value.length < 3) {
      return translate('validation.usernameMin');
    }
    if (value.length > 30) {
      return translate('validation.usernameMax');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return translate('validation.usernameInvalid');
    }
    return null;
  },

  // التحقق من كلمة المرور
  password: (value) => {
    if (!value || value.length === 0) {
      return translate('validation.passwordRequired');
    }
    if (value.length < 8) {
      return translate('validation.passwordMin');
    }
    if (value.length > 72) {
      return translate('validation.passwordMax');
    }
    return null;
  },

  // التحقق من تأكيد كلمة المرور
  confirmPassword: (value, password) => {
    if (!value || value.length === 0) {
      return translate('validation.confirmPasswordRequired');
    }
    if (value !== password) {
      return translate('validation.passwordsMismatch');
    }
    return null;
  },

  // التحقق من الاسم
  name: (value) => {
    if (!value || value.trim().length === 0) {
      return translate('validation.nameRequired');
    }
    if (value.length > 60) {
      return translate('validation.nameMax');
    }
    return null;
  },

  // التحقق من البريد الإلكتروني
  email: (value) => {
    if (!value || value.trim().length === 0) {
      return translate('validation.emailRequired');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return translate('validation.emailInvalid');
    }
    return null;
  },

  // التحقق من رقم الهاتف
  phone: (value) => {
    if (!value || value.trim().length === 0) {
      return translate('validation.phoneRequired');
    }
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(value)) {
      return translate('validation.phoneInvalid');
    }
    return null;
  },

  // التحقق من حقل مطلوب
  required: (value, fieldName = translate('validation.thisField')) => {
    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      return translate('validation.required', { fieldName });
    }
    return null;
  },

  // التحقق من الحد الأدنى للطول
  minLength: (value, min, fieldName = translate('validation.thisField')) => {
    if (!value || value.length < min) {
      return translate('validation.minLength', { fieldName, min });
    }
    return null;
  },

  // التحقق من الحد الأقصى للطول
  maxLength: (value, max, fieldName = translate('validation.thisField')) => {
    if (value && value.length > max) {
      return translate('validation.maxLength', { fieldName, max });
    }
    return null;
  },
};

export default validation;
