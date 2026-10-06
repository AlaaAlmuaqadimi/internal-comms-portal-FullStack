// أدوات التحقق من صحة البيانات

export const validation = {
  // التحقق من اسم المستخدم
  username: (value) => {
    if (!value || value.trim().length === 0) {
      return 'اسم المستخدم مطلوب';
    }
    if (value.length < 3) {
      return 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
    }
    if (value.length > 30) {
      return 'اسم المستخدم يجب ألا يتجاوز 30 حرفاً';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط';
    }
    return null;
  },

  // التحقق من كلمة المرور
  password: (value) => {
    if (!value || value.length === 0) {
      return 'كلمة المرور مطلوبة';
    }
    if (value.length < 8) {
      return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    }
    if (value.length > 72) {
      return 'كلمة المرور يجب ألا تتجاوز 72 حرفاً';
    }
    return null;
  },

  // التحقق من تأكيد كلمة المرور
  confirmPassword: (value, password) => {
    if (!value || value.length === 0) {
      return 'تأكيد كلمة المرور مطلوب';
    }
    if (value !== password) {
      return 'كلمتا المرور غير متطابقتين';
    }
    return null;
  },

  // التحقق من الاسم
  name: (value) => {
    if (!value || value.trim().length === 0) {
      return 'الاسم مطلوب';
    }
    if (value.length > 60) {
      return 'الاسم يجب ألا يتجاوز 60 حرفاً';
    }
    return null;
  },

  // التحقق من البريد الإلكتروني
  email: (value) => {
    if (!value || value.trim().length === 0) {
      return 'البريد الإلكتروني مطلوب';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'البريد الإلكتروني غير صحيح';
    }
    return null;
  },

  // التحقق من رقم الهاتف
  phone: (value) => {
    if (!value || value.trim().length === 0) {
      return 'رقم الهاتف مطلوب';
    }
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(value)) {
      return 'رقم الهاتف غير صحيح';
    }
    return null;
  },

  // التحقق من حقل مطلوب
  required: (value, fieldName = 'هذا الحقل') => {
    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      return `${fieldName} مطلوب`;
    }
    return null;
  },

  // التحقق من الحد الأدنى للطول
  minLength: (value, min, fieldName = 'هذا الحقل') => {
    if (!value || value.length < min) {
      return `${fieldName} يجب أن يكون ${min} أحرف على الأقل`;
    }
    return null;
  },

  // التحقق من الحد الأقصى للطول
  maxLength: (value, max, fieldName = 'هذا الحقل') => {
    if (value && value.length > max) {
      return `${fieldName} يجب ألا يتجاوز ${max} حرفاً`;
    }
    return null;
  },
};

export default validation;
