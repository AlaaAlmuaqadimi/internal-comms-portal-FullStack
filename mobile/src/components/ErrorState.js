import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import CustomButton from './CustomButton';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

const ErrorState = ({
  icon = 'alert-circle',
  title,
  description,
  actionTitle,
  onAction,
  style,
}) => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={48} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title || t('common.errorOccurred')}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {(actionTitle || t('common.retry')) && onAction && (
        <CustomButton
          title={actionTitle || t('common.retry')}
          onPress={onAction}
          variant="primary"
          style={styles.button}
        />
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  button: {
    marginTop: spacing.md,
  },
});

export default ErrorState;
