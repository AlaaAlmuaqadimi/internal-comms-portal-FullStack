// الخطوط والأحجام - مستخرجة من النسخة الأصلية
import { Platform } from 'react-native';

// نوع الخط الرئيسي - يمكن تغييره بسهولة من هنا
export const FONT_FAMILY = 'Cairo_400Regular';
export const FONT_FAMILY_BOLD = 'Cairo_700Bold';
export const FONT_FAMILY_EXTRA_BOLD = 'Cairo_800ExtraBold';

// أنواع الخطوط المتاحة
export const FONT_FAMILIES = {
  cairo: 'Cairo_400Regular',
  cairoBold: 'Cairo_700Bold',
  cairoExtraBold: 'Cairo_800ExtraBold',
  system: Platform.OS === 'ios' ? 'System' : 'Roboto',
  monospace: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};

export const typography = {
  // العناوين
  h1: {
    fontSize: 28,
    fontFamily: 'Cairo_800ExtraBold',
    lineHeight: 40,
    fontFamily: FONT_FAMILY_EXTRA_BOLD,
  },
  h2: {
    fontSize: 24,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 34,
    fontFamily: FONT_FAMILY_BOLD,
  },
  h3: {
    fontSize: 20,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 28,
    fontFamily: FONT_FAMILY_BOLD,
  },
  h4: {
    fontSize: 18,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 26,
    fontFamily: FONT_FAMILY_BOLD,
  },
  
  // النصوص
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    fontFamily: FONT_FAMILY,
  },
  bodyBold: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 24,
    fontFamily: FONT_FAMILY_BOLD,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    fontFamily: FONT_FAMILY,
  },
  bodySmallBold: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 20,
    fontFamily: FONT_FAMILY_BOLD,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    fontFamily: FONT_FAMILY,
  },
  captionBold: {
    fontSize: 13,
    fontFamily: 'Cairo_700Bold',
    lineHeight: 18,
    fontFamily: FONT_FAMILY_BOLD,
  },
  small: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    fontFamily: FONT_FAMILY,
  },
  
  // الأزرار
  button: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    fontFamily: FONT_FAMILY_BOLD,
  },
  buttonSmall: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    fontFamily: FONT_FAMILY_BOLD,
  },
};

export default typography;
