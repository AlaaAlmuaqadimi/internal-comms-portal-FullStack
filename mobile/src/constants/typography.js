// الخطوط والأحجام - مستخرجة من النسخة الأصلية
import { Platform } from 'react-native';

export const typography = {
  // العناوين
  h1: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 34,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  h4: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  
  // النصوص
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  bodySmallBold: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  captionBold: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  
  // الأزرار
  button: {
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSmall: {
    fontSize: 14,
    fontWeight: '700',
  },
};

export default typography;
