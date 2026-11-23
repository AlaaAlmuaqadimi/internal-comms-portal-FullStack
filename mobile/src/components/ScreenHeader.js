import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * Light header for sub-screens and full-screen windows: a round back (or
 * close) button, the title and an optional one-line subtitle.
 */
const ScreenHeader = ({ title, subtitle, onBack, variant = 'back', right = null }) => {
  const { colors } = useTheme();
  const { t, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  const icon = variant === 'close' ? 'close' : isRTL ? 'arrow-forward' : 'arrow-back';

  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={variant === 'close' ? t('common.close') : t('common.back')}
        >
          <Ionicons name={icon} size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.background,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.sm,
    },
    backButtonPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.95 }],
    },
    text: {
      flex: 1,
    },
    title: {
      ...typography.h3,
      color: colors.text,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });

export default ScreenHeader;
