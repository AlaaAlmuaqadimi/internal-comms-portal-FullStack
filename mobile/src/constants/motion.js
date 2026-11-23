// الحركة في التطبيق — مفتاح واحد لكل الحركات.
//
// To turn every animation in the app off, set ANIMATIONS_ENABLED to false.
// Animations are also skipped when the phone's "Reduce Motion" accessibility
// setting is on.
export const ANIMATIONS_ENABLED = true;

export const motion = {
  // Short and calm: content should feel alive, never slow.
  enterDuration: 260,
  fastDuration: 180,
  // Rows of a list come in one after another, only for the first few rows.
  staggerStep: 35,
  staggerMaxItems: 8,
  enterDistance: 12,
};

/** Delay for the n-th row of a list (the first rows cascade, the rest don't). */
export const listItemDelay = (index) =>
  Math.min(Math.max(0, Number(index) || 0), motion.staggerMaxItems) * motion.staggerStep;
