// أدوات تنسيق البيانات
import { translate, getCurrentLanguage } from '../context/LanguageContext';

export const formatters = {
  // تنسيق التاريخ
  date: (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(getCurrentLanguage() === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },

  // تنسيق الوقت
  time: (timeString) => {
    if (!timeString) return '';
    return timeString;
  },

  // تنسيق مدة المكالمة
  duration: (seconds) => {
    if (!seconds || seconds === 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  // تنسيق رقم الهاتف
  phone: (phone) => {
    if (!phone) return '';
    // تنسيق رقم الهاتف السعودي
    if (phone.startsWith('05')) {
      return `+966 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
    }
    return phone;
  },

  // تنسيق الأرقام
  number: (num) => {
    if (num === null || num === undefined) return '';
    return num.toLocaleString(getCurrentLanguage() === 'ar' ? 'ar-SA' : 'en-US');
  },

  // تنسيق النص الطويل
  truncate: (text, maxLength = 50) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  // تنسيق الحرف الأول
  initial: (name) => {
    if (!name) return '؟';
    return name.charAt(0);
  },

  // تنسيق حالة الاتصال
  status: (status) => {
    switch (status) {
      case 'online':
        return translate('formatters.online');
      case 'offline':
        return translate('formatters.offline');
      default:
        return status;
    }
  },

  // تنسيق نوع المكالمة
  callType: (type) => {
    switch (type) {
      case 'incoming':
        return translate('formatters.incoming');
      case 'outgoing':
        return translate('formatters.outgoing');
      case 'missed':
        return translate('formatters.missed');
      default:
        return type;
    }
  },
};

export default formatters;
