// الهوية البصرية للمشروع - مستخرجة من النسخة الأصلية
export const colors = {
  // الألوان الأساسية
  primary: '#14283f',        // الأزرق الداكن - العناوين والنصوص الرئيسية
  primaryLight: '#1769a3',   // الأزرق المتوسط - الأزرار والروابط
  accent: '#c4a56a',         // الذهبي - الحدود والخلفيات المميزة

  // الألوان الثانوية
  secondary: '#526579',      // الرمادي الفاتح - النصوص الثانوية
  secondaryLight: '#64748b', // الرمادي الفاتح جداً

  // الخلفيات
  background: '#f3f6f9',     // الخلفية الرئيسية
  surface: '#ffffff',        // البطاقات والأسطح
  surfaceDark: '#14283f',    // الخلفية الداكنة (الهيدر)

  // ألوان الحالة
  success: '#236b56',        // الأخضر - المتصل
  successLight: '#eaf6f1',   // خلفية المتصل
  successBorder: '#c8e6da',
  warning: '#8a6a2f',        // الذهبي الداكن - المطبخ
  warningLight: '#fbf6ec',   // خلفية المطبخ
  warningBorder: '#e9dcc2',
  warningSurface: '#f8f5ef',
  warningText: '#5b4515',
  warningTextMuted: '#7a6538',
  danger: '#b84a4a',         // الأحمر - الحذف/الإنهاء
  dangerStrong: '#DC2626',   // الأحمر الصريح - أخطاء التحقق في النماذج
  dangerLight: '#fdf0ec',    // خلفية الخطأ
  dangerBorder: '#f0d0c8',

  // حدود
  border: '#e3e9ef',         // الحدود العادية
  borderDark: '#cbd7e2',     // الحدود الداكنة

  // نصوص
  text: '#14283f',           // النص الرئيسي
  textSecondary: '#526579',  // النص الثانوي
  textLight: '#64748b',      // النص الفاتح
  textWhite: '#ffffff',      // النص الأبيض
  textGold: '#e4c990',       // النص الذهبي على الخلفية الداكنة

  // شفافية
  overlay: 'rgba(20, 40, 63, 0.5)', // خلفية النوافذ المنبثقة

  // أسطح إضافية
  infoLight: '#eef4fa',
  infoBorder: '#d8e6f2',
  selectedSurface: '#f5f9fc',
  iconSurface: '#eaf1f7',
  avatarSurface: '#eaf1f7',
  avatarKitchenSurface: '#f4ede0',
  avatarImageSurface: '#e5ecf1',
};

// ألوان الوضع الداكن - نفس مفاتيح الوضع الفاتح حتى تعمل كل الشاشات
// التي تقرأ القيم من السمة بدون تغييرات إضافية.
export const darkColors = {
  ...colors,
  background: '#0f172a',
  surface: '#1e293b',
  surfaceDark: '#0f172a',
  primary: '#f1f5f9',
  primaryLight: '#3b82f6',
  secondary: '#cbd5e1',
  secondaryLight: '#94a3b8',

  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textLight: '#64748b',
  textWhite: '#ffffff',
  textGold: '#e4c990',

  border: '#334155',
  borderDark: '#475569',
  overlay: 'rgba(0, 0, 0, 0.7)',

  success: '#4ade80',
  successLight: '#122a22',
  successBorder: '#1f4a3a',

  warning: '#e4c990',
  warningLight: '#2b2416',
  warningBorder: '#4a3d22',
  warningSurface: '#241f14',
  warningText: '#e9d7a8',
  warningTextMuted: '#c4a56a',

  danger: '#f87171',
  dangerLight: '#341b1b',
  dangerBorder: '#5a2a2a',

  infoLight: '#16283d',
  infoBorder: '#243b55',
  selectedSurface: '#1b2e45',
  iconSurface: '#1b2e45',
  avatarSurface: '#1e293b',
  avatarKitchenSurface: '#2b2416',
  avatarImageSurface: '#1e293b',
};

export default colors;
