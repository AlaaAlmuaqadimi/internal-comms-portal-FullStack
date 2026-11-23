import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import WheelPicker from './WheelPicker';
import CustomButton from './CustomButton';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';
import {
  MAX_DURATION_DAYS,
  MAX_DURATION_HOURS,
  clampDurationHours,
  dayOptions,
  formatDurationHours,
  hourOptions,
} from '../utils/duration';

// One wheel area height for both platforms: 5 rows of 48 on Android and the
// same 240 for the native iOS wheel, so the touch area is large and equal.
const WHEEL_ROW_HEIGHT = 48;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS;

/**
 * Duration editor for the create-notification modal.
 *
 * The draft value and the wheel state live here, not in NotificationsScreen, so
 * flicking a wheel never re-renders the screen (with its directory and list).
 * The screen only receives the final number of hours through `onConfirm`.
 */
const DurationPickerBody = ({ initialHours = 24, onConfirm, onCancel }) => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const [hours, setHours] = useState(() => clampDurationHours(initialHours));

  const days = Math.min(MAX_DURATION_DAYS, Math.floor(hours / 24));
  const hoursIndex = days >= MAX_DURATION_DAYS ? 0 : hours % 24;

  const presets = useMemo(
    () => [
      { hours: 1, label: t('notifications.durationPreset1h') },
      { hours: 24, label: t('notifications.duration1d') },
      { hours: 48, label: t('notifications.duration2d') },
      { hours: 24 * 7, label: t('notifications.duration7d') },
      { hours: 24 * 14, label: t('notifications.duration14d') },
      { hours: 24 * 30, label: t('notifications.duration30d') },
    ],
    [t]
  );

  const handleDaysChange = useCallback((index) => {
    const nextDays = Math.min(
      MAX_DURATION_DAYS,
      Math.max(0, Math.round(index))
    );
    setHours((prev) => {
      if (nextDays >= MAX_DURATION_DAYS) return MAX_DURATION_HOURS;
      return clampDurationHours(nextDays * 24 + (prev % 24));
    });
  }, []);

  const handleHoursChange = useCallback((index) => {
    const nextHours = Math.min(23, Math.max(0, Math.round(index)));
    setHours((prev) => {
      const prevDays = Math.floor(prev / 24);
      if (prevDays >= MAX_DURATION_DAYS) return MAX_DURATION_HOURS;
      return clampDurationHours(prevDays * 24 + nextHours);
    });
  }, []);

  const applyPreset = useCallback((presetHours) => {
    setHours(clampDurationHours(presetHours));
  }, []);

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>{t('notifications.durationHint')}</Text>

      {/* The two wheels fill the whole wheel area: each one owns its half,
          so a drag anywhere in that half (top, middle, bottom, edges) moves
          that wheel. The column titles are overlays with pointerEvents
          "none", so they never swallow a touch. Nothing wraps the wheels in
          a ScrollView or a Pressable. */}
      <View style={styles.wheelRow}>
        <View style={styles.wheelColumn}>
          {Platform.OS === 'ios' ? (
            <Picker
              selectedValue={days}
              onValueChange={handleDaysChange}
              itemStyle={styles.pickerItem}
              style={styles.picker}
            >
              {dayOptions.map((option, index) => (
                <Picker.Item key={option} label={option} value={index} />
              ))}
            </Picker>
          ) : (
            <WheelPicker
              value={days}
              onChange={handleDaysChange}
              items={dayOptions}
              itemHeight={WHEEL_ROW_HEIGHT}
              visibleRows={WHEEL_VISIBLE_ROWS}
              style={styles.wheel}
            />
          )}
          <View pointerEvents="none" style={styles.wheelLabelOverlay}>
            <Text style={styles.wheelLabel}>
              {t('notifications.durationDaysLabel')}
            </Text>
          </View>
        </View>
        <View style={styles.wheelDivider} pointerEvents="none" />
        <View style={styles.wheelColumn}>
          {Platform.OS === 'ios' ? (
            <Picker
              selectedValue={hoursIndex}
              onValueChange={handleHoursChange}
              itemStyle={styles.pickerItem}
              style={styles.picker}
            >
              {hourOptions.map((option, index) => (
                <Picker.Item key={option} label={option} value={index} />
              ))}
            </Picker>
          ) : (
            <WheelPicker
              value={hoursIndex}
              onChange={handleHoursChange}
              items={hourOptions}
              itemHeight={WHEEL_ROW_HEIGHT}
              visibleRows={WHEEL_VISIBLE_ROWS}
              style={styles.wheel}
            />
          )}
          <View pointerEvents="none" style={styles.wheelLabelOverlay}>
            <Text style={styles.wheelLabel}>
              {t('notifications.durationHoursLabel')}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.summary}>
        {t('notifications.detailsDuration', {
          duration: formatDurationHours(hours, t),
        })}
      </Text>
      <Text style={styles.rangeHint}>
        {t('notifications.durationRangeHint')}
      </Text>

      <View style={styles.presetRow}>
        {presets.map((preset) => {
          const active = hours === preset.hours;
          return (
            <Pressable
              key={preset.hours}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => applyPreset(preset.hours)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <CustomButton
          title={t('common.cancel')}
          onPress={onCancel}
          variant="outline"
          size="small"
          style={styles.actionButton}
        />
        <CustomButton
          title={t('common.confirm')}
          onPress={() => onConfirm(clampDurationHours(hours))}
          size="small"
          icon="checkmark"
          style={styles.actionButton}
        />
      </View>
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    body: {
      paddingVertical: spacing.xs,
    },
    hint: {
      ...typography.bodySmall,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    wheelRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      height: WHEEL_HEIGHT,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    wheelColumn: {
      flex: 1,
      height: WHEEL_HEIGHT,
      justifyContent: 'center',
    },
    wheelDivider: {
      width: 1,
      backgroundColor: colors.border,
    },
    wheelLabelOverlay: {
      position: 'absolute',
      top: spacing.xs,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    wheelLabel: {
      ...typography.captionBold,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    // The Android wheel fills its half and drops its own frame (the row
    // already draws one).
    wheel: {
      width: '100%',
      height: WHEEL_HEIGHT,
      borderWidth: 0,
      borderRadius: 0,
    },
    // Native iOS wheel (UIPickerView) stretched over its whole half. Nothing
    // around it intercepts touches, so it scrolls with native inertia.
    picker: {
      width: '100%',
      height: WHEEL_HEIGHT,
    },
    // textAlign is explicit: flipStyles would otherwise right-align text
    // styles in Arabic and push the wheel numbers off-centre.
    pickerItem: {
      fontSize: 22,
      height: WHEEL_HEIGHT,
      color: colors.text,
      textAlign: 'center',
    },
    summary: {
      ...typography.bodyBold,
      color: colors.primaryLight,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    rangeHint: {
      ...typography.small,
      color: colors.textLight,
      textAlign: 'center',
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    chipActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primaryLight,
    },
    chipText: {
      ...typography.captionBold,
      color: colors.text,
    },
    chipTextActive: {
      color: colors.textWhite,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    actionButton: {
      flex: 1,
    },
  });

export default DurationPickerBody;
