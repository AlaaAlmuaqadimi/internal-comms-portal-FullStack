// Notification duration is stored as a number of hours. The two wheels, the
// preset chips and the list label all use these helpers so the limits and the
// wording stay in one place.

export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_DAYS = 30;
export const MAX_DURATION_HOURS = MAX_DURATION_DAYS * 24;

export const clampDurationHours = (hours) =>
  Math.min(
    MAX_DURATION_HOURS,
    Math.max(MIN_DURATION_HOURS, Math.round(Number(hours) || 0))
  );

export const dayOptions = Array.from(
  { length: MAX_DURATION_DAYS + 1 },
  (_, index) => String(index)
);

export const hourOptions = Array.from({ length: 24 }, (_, index) =>
  String(index)
);

export const formatDurationHours = (rawHours, t) => {
  const hours = clampDurationHours(rawHours);
  if (hours === 1) return t('notifications.durationPreset1h');

  const days = Math.floor(hours / 24);
  const remainder = hours % 24;

  if (days > 0 && remainder > 0) {
    return t('notifications.durationSummary', { days, hours: remainder });
  }
  if (days > 0) return t('notifications.durationDaysOnly', { days });
  return t('notifications.durationHoursOnly', { hours: remainder });
};
