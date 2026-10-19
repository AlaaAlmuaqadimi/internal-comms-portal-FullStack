// انعكاس أنماط الـ layout وتصحيح الاتجاهات لتطبيق الـ RTL بالكامل
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
      if (s.flexDirection === 'row-reverse') flipped.flexDirection = 'row';

      // عكس محاذاة الـ Flex
      if (s.alignItems === 'flex-start') flipped.alignItems = 'flex-end';
      else if (s.alignItems === 'flex-end') flipped.alignItems = 'flex-start';

      if (s.justifyContent === 'flex-start') flipped.justifyContent = 'flex-end';
      else if (s.justifyContent === 'flex-end') flipped.justifyContent = 'flex-start';

      if (s.alignSelf === 'flex-start') flipped.alignSelf = 'flex-end';
      else if (s.alignSelf === 'flex-end') flipped.alignSelf = 'flex-start';

      // عكس محاذاة النصوص تلقائياً إذا لم يتم تحديدها بشكل صريح
      if (s.textAlign === 'left') flipped.textAlign = 'right';
      else if (s.textAlign === 'right') flipped.textAlign = 'left';
      // إذا لم يكن هناك textAlign وكان العنصر نصياً، اجعله يميناً في العربية
      else if (s.textAlign === undefined && (s.fontSize || s.fontWeight || s.lineHeight)) {
        flipped.textAlign = 'right';
      }

      // إبدال الهوامش والمسافات والحواف
      for (const [a, b] of swapPairs) {
        if (s[a] !== undefined) { flipped[b] = s[a]; delete flipped[a]; }
        if (s[b] !== undefined) { flipped[a] = s[b]; delete flipped[b]; }
      }
    }
    out[key] = flipped;
  }
  return out;
};
