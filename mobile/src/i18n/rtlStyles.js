// انعكاس أنماط الـ layout لتطبيق الاتجاه من اليمين لليسار (RTL)
// نستخدمه بدل الاعتماد على I18nManager لتغيير الاتجاه فعلياً في نفس الجلسة
const swapPairs = [
  ['marginLeft', 'marginRight'],
  ['paddingLeft', 'paddingRight'],
  ['borderLeftWidth', 'borderRightWidth'],
  ['borderLeftColor', 'borderRightColor'],
  ['borderTopLeftRadius', 'borderTopRightRadius'],
  ['borderBottomLeftRadius', 'borderBottomRightRadius'],
  ['left', 'right'],
];

export const flipStyles = (rawStyles, isRTL) => {
  if (!isRTL) return rawStyles;
  const out = {};
  for (const key of Object.keys(rawStyles)) {
    const s = rawStyles[key];
    const flipped = { ...s };
    if (s && typeof s === 'object') {
      // عكس اتجاه الصفوف
      if (s.flexDirection === 'row') flipped.flexDirection = 'row-reverse';
      if (s.alignSelf === 'flex-start') flipped.alignSelf = 'flex-end';
      else if (s.alignSelf === 'flex-end') flipped.alignSelf = 'flex-start';
      // إبدال الهوامش والمسافات
      for (const [a, b] of swapPairs) {
        if (s[a] !== undefined) { flipped[b] = s[a]; delete flipped[a]; }
        if (s[b] !== undefined) { flipped[a] = s[b]; delete flipped[b]; }
      }
    }
    out[key] = flipped;
  }
  return out;
};
