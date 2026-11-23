// الهوية البصرية للمشروع - مستخرجة من النسخة الأصلية
export const colors = {
  // الألوان الأساسية
  primary: '#0f2340',        // الأزرق الداكن - العناوين والنصوص الرئيسية
  primaryLight: '#2563eb',   // الأزرق الحيوي - الأزرار والروابط
  accent: '#c4a56a',         // الذهبي - الحدود والخلفيات المميزة

  // الألوان الثانوية
  secondary: '#475569',      // الرمادي الفاتح - النصوص الثانوية
  secondaryLight: '#64748b', // الرمادي الفاتح جداً

  // الخلفيات
  background: '#f5f7fb',     // الخلفية الرئيسية
  surface: '#ffffff',        // البطاقات والأسطح
  surfaceDark: '#0f2340',    // الخلفية الداكنة (الهيدر)

  // ألوان الحالة
  success: '#15803d',        // الأخضر - المتصل
  successLight: '#ecfdf3',   // خلفية المتصل
  successBorder: '#bbf0cf',
  warning: '#8a6a2f',        // الذهبي الداكن - المطبخ
  warningLight: '#fbf6ec',   // خلفية المطبخ
  warningBorder: '#e9dcc2',
  warningSurface: '#f8f5ef',
  warningText: '#5b4515',
  warningTextMuted: '#7a6538',
  danger: '#dc2626',         // الأحمر - الحذف/الإنهاء
  dangerStrong: '#DC2626',   // الأحمر الصريح - أخطاء التحقق في النماذج
  dangerLight: '#fef2f2',    // خلفية الخطأ
  dangerBorder: '#fbd5d5',

  // حدود
  border: '#e6ebf2',         // الحدود العادية
  borderDark: '#cfd8e3',     // الحدود الداكنة

  // نصوص
  text: '#0f1c2e',           // النص الرئيسي
  textSecondary: '#475569',  // النص الثانوي
  textLight: '#64748b',      // النص الفاتح
  textWhite: '#ffffff',      // النص الأبيض
  textGold: '#e4c990',       // النص الذهبي على الخلفية الداكنة

  // شفافية
  overlay: 'rgba(15, 28, 46, 0.45)', // خلفية النوافذ المنبثقة

  // أسطح إضافية
  infoLight: '#eff5ff',
  infoBorder: '#d6e4ff',
  selectedSurface: '#f0f5ff',
  iconSurface: '#eaf1ff',
  avatarSurface: '#e8efff',
  avatarKitchenSurface: '#f4ede0',
  avatarImageSurface: '#e5ecf1',
  primarySoft: '#e8f0ff',      // خلفية ناعمة للعناصر المحددة (التبويب النشط)
};

// ألوان الوضع الداكن - نفس مفاتيح الوضع الفاتح حتى تعمل كل الشاشات
// التي تقرأ القيم من السمة بدون تغييرات إضافية.
export const darkColors = {
  ...colors,
  background: '#0b1220',
  surface: '#151e2e',
  surfaceDark: '#0b1220',
  primary: '#f1f5f9',
  primaryLight: '#5b9bff',
  secondary: '#cbd5e1',
  secondaryLight: '#94a3b8',

  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textLight: '#7c8aa0',
  textWhite: '#ffffff',
  textGold: '#e4c990',

  border: '#243042',
  borderDark: '#334155',
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
  // Brighter than the light theme's red so form errors stay readable on dark surfaces.
  dangerStrong: '#f87171',
  dangerLight: '#341b1b',
  dangerBorder: '#5a2a2a',

  infoLight: '#16283d',
  infoBorder: '#243b55',
  selectedSurface: '#1b2e45',
  iconSurface: '#1b2e45',
  avatarSurface: '#1c2940',
  avatarKitchenSurface: '#2b2416',
  avatarImageSurface: '#1c2940',
  primarySoft: '#1a2b4a',
};

export default colors;
