import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * Accessible, dependency-free select field.
 *
 * The list is rendered inline (not as a nested native modal) so it works inside
 * the org-unit form modal on both iOS and Android.
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
}) => {
  const [open, setOpen] = useState(false);
  const { t, isRTL, align } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const selected = options.find((option) => option.value === value);
  const isDisabled = disabled || options.length === 0;

  const handleSelect = (option) => {
    if (option.disabled) return;
    onSelect(option.value);
    setOpen(false);
  };

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
          open && styles.fieldOpen,
          error && styles.fieldError,
          isDisabled && styles.fieldDisabled,
        ]}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.value,
            { textAlign: align },
            !selected && styles.placeholder,
            isDisabled && styles.valueDisabled,
          ]}
        >
          {selected ? selected.label : placeholder || t('common.select')}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isDisabled ? colors.textLight : colors.textSecondary}
        />
      </Pressable>

      {open && !isDisabled && (
        <View style={styles.optionsContainer}>
          <ScrollView style={{ maxHeight: maxListHeight }} nestedScrollEnabled>
            {options.length === 0 ? (
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
            )}
          </ScrollView>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
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
    color: colors.danger,
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
  fieldError: {
    borderColor: colors.danger,
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
    color: colors.danger,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
});

export default SelectField;
