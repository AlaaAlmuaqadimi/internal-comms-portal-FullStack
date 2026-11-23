import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * A form field that opens a picker (e.g. the org-unit tree). Looks like
 * CustomInput so forms stay consistent.
 */
const PickerField = ({
  label,
  required = false,
  value,
  placeholder,
  onPress,
  error,
  hint,
  loading = false,
  icon = 'git-network-outline',
  expanded = false,
}) => {
  const { colors } = useTheme();
  const { isRTL, align } = useLanguage();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  return (
    <View style={styles.container}>
      {!!label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.trigger,
          !!error && styles.triggerError,
          pressed && styles.triggerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={value || placeholder}
        accessibilityState={{ expanded }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primaryLight} />
        ) : (
          <Ionicons name={icon} size={20} color={error ? colors.dangerStrong : colors.textLight} />
        )}
        <Text
          numberOfLines={2}
          style={[styles.value, { textAlign: align }, !value && styles.placeholder]}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, { textAlign: align }]}>{hint}</Text>
      ) : null}
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    label: {
      ...typography.bodySmallBold,
      color: colors.textSecondary,
      marginBottom: spacing.xs + 2,
    },
    required: {
      color: colors.danger,
    },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
    },
    triggerError: {
      borderColor: colors.dangerStrong,
      borderWidth: 1.5,
    },
    triggerPressed: {
      backgroundColor: colors.surface,
      borderColor: colors.primaryLight,
    },
    value: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    placeholder: {
      color: colors.textLight,
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
  });

export default PickerField;
