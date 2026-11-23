// الخطوط والأحجام
//
// الخط الرئيسي: IBM Plex Sans Arabic — خط حديث وواضح يدعم العربية والإنجليزية
// بنفس الطابع. لتغيير الخط في التطبيق كله يكفي تعديل `fonts` هنا وقائمة
// التحميل في App.js.
import { Platform } from 'react-native';

export const fonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semiBold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
};

export const FONT_FAMILY = fonts.regular;
export const FONT_FAMILY_MEDIUM = fonts.medium;
export const FONT_FAMILY_SEMIBOLD = fonts.semiBold;
export const FONT_FAMILY_BOLD = fonts.bold;
// Kept for older imports: the heaviest weight now maps to Bold.
export const FONT_FAMILY_EXTRA_BOLD = fonts.bold;

/**
 * Font file for a CSS-style weight. Custom fonts on Android ignore
 * `fontWeight`, so every weight must point at its own font file.
 */
export function fontFor(weight) {
  const w = String(weight ?? '400');
  if (w === 'bold' || Number(w) >= 700) return fonts.bold;
  if (Number(w) >= 600) return fonts.semiBold;
  if (Number(w) >= 500) return fonts.medium;
  return fonts.regular;
}

export const FONT_FAMILIES = {
  ...fonts,
  system: Platform.OS === 'ios' ? 'System' : 'Roboto',
  monospace: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};

export const typography = {
  // العناوين
  display: {
    fontSize: 32,
    lineHeight: 44,
    fontFamily: fonts.bold,
    letterSpacing: -0.4,
  },
  h1: {
    fontSize: 28,
    lineHeight: 40,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: 22,
    lineHeight: 32,
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: 19,
    lineHeight: 28,
    fontFamily: fonts.semiBold,
  },
  h4: {
    fontSize: 17,
    lineHeight: 26,
    fontFamily: fonts.semiBold,
  },

  // النصوص
  body: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: fonts.regular,
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: fonts.medium,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: fonts.semiBold,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
  },
  bodySmallBold: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.semiBold,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  captionBold: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.semiBold,
  },
  small: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
  },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.4,
  },

  // الأزرار
  button: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.semiBold,
  },
  buttonSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.semiBold,
  },
};

export default typography;
