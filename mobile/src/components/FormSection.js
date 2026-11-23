import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';
import { FadeInView } from './Motion';

/** A titled card that groups related form fields. */
const FormSection = ({ icon, title, description, children, style, delay = 0 }) => {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  return (
    <FadeInView delay={delay} style={[styles.card, style]}>
      <View style={styles.header}>
        {!!icon && (
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={18} color={colors.primaryLight} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {!!description && <Text style={styles.description}>{description}</Text>}
        </View>
      </View>
      {children}
    </FadeInView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      paddingBottom: spacing.xs,
      marginBottom: spacing.md,
      ...shadows.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    headerText: {
      flex: 1,
    },
    title: {
      ...typography.h4,
      color: colors.text,
    },
    description: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });

export default FormSection;
