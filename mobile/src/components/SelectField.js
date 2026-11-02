import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal as RNModal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * Accessible, dependency-free select field.
 *
 * Two presentations are supported:
 *  - `inline` (default): the option list expands under the field. Kept for
 *    forms such as the edit-employee modal where that behaviour is expected.
 *  - `sheet`: the options open in a bottom sheet, so a filter bar never
 *    reflows or stretches when a list is opened.
 */
const SelectField = ({
  label,
  value,
  options = [],
  onSelect,
  placeholder,
  required = false,
  error,
  hint,
  disabled = false,
  emptyText,
  style,
  maxListHeight = 240,
  compact = false,
  presentation = 'inline',
  sheetTitle,
}) => {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const { t, isRTL, align } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const selected = options.find((option) => option.value === value);
  const isDisabled = disabled || options.length === 0;
  const isSheet = presentation === 'sheet';

  const close = () => setOpen(false);

  const handleSelect = (option) => {
    if (option.disabled) return;
    onSelect(option.value);
    close();
  };

  const optionRows =
    options.length === 0 ? (
      <Text style={[styles.emptyText, { textAlign: align }]}>
        {emptyText || t('common.noOptions')}
      </Text>
    ) : (
      options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => handleSelect(option)}
            disabled={option.disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: option.disabled }}
            style={[
              styles.option,
              isSelected && styles.optionSelected,
              option.disabled && styles.optionDisabled,
            ]}
          >
            <View style={styles.optionTextWrap}>
              <Text
                style={[
                  styles.optionText,
                  { textAlign: align },
                  isSelected && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text style={[styles.optionDescription, { textAlign: align }]}>
                  {option.description}
                </Text>
              ) : null}
            </View>
            {isSelected && (
              <Ionicons name="checkmark" size={18} color={colors.primaryLight} />
            )}
          </Pressable>
        );
      })
    );

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <Pressable
        onPress={() => !isDisabled && setOpen((prev) => !prev)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: isDisabled }}
        style={[
          styles.field,
          compact && styles.fieldCompact,
          open && styles.fieldOpen,
          error && styles.fieldError,
          isDisabled && styles.fieldDisabled,
        ]}
      >
        <Text
          numberOfLines={compact ? 1 : 2}
          style={[
            styles.value,
            compact && styles.valueCompact,
            { textAlign: align },
            !selected && styles.placeholder,
            isDisabled && styles.valueDisabled,
          ]}
        >
          {selected ? selected.label : placeholder || t('common.select')}
        </Text>
        <Ionicons
          name={!isSheet && open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isDisabled ? colors.textLight : colors.textSecondary}
        />
      </Pressable>

      {!isSheet && open && !isDisabled && (
        <View style={styles.optionsContainer}>
          <ScrollView style={{ maxHeight: maxListHeight }} nestedScrollEnabled>
            {optionRows}
          </ScrollView>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}

      {isSheet && (
        <RNModal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={close}
          statusBarTranslucent
        >
          <View style={styles.sheetBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            />

            <SafeAreaView style={styles.sheetSafe} edges={['bottom']}>
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {sheetTitle || label || placeholder || t('common.select')}
                  </Text>
                  <Pressable
                    onPress={close}
                    hitSlop={10}
                    style={styles.sheetClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                  >
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={[
                    styles.sheetList,
                    { maxHeight: Math.max(200, Math.round(height * 0.55)) },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {optionRows}
                </ScrollView>
              </View>
            </SafeAreaView>
          </View>
        </RNModal>
      )}
    </View>
  );
};

const rawStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.dangerStrong,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  fieldOpen: {
    borderColor: colors.primaryLight,
  },
  // Label-free filter rows: keep the trigger at the 44px touch-target height
  // instead of the taller form-field default.
  fieldCompact: {
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  valueCompact: {
    paddingVertical: 0,
  },
  fieldError: {
    borderColor: colors.dangerStrong,
  },
  fieldDisabled: {
    backgroundColor: colors.background,
    opacity: 0.6,
  },
  value: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  valueDisabled: {
    color: colors.textLight,
  },
  placeholder: {
    color: colors.textLight,
  },
  optionsContainer: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionSelected: {
    backgroundColor: '#f5f9fc',
  },
  optionDisabled: {
    opacity: 0.45,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textLight,
    padding: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.dangerStrong,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  // Bottom-sheet presentation ------------------------------------------------
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetSafe: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
    ...shadows.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderDark,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
  },
  sheetClose: {
    padding: spacing.xs,
  },
  sheetList: {
    flexGrow: 0,
  },
});

export default SelectField;
