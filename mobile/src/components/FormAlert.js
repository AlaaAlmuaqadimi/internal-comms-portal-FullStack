import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';

/** Error banner at the top of a form, announced to screen readers. */
const FormAlert = ({ message, children, style }) => {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  if (!message) return null;
  return (
    <View
      style={[styles.box, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={20} color={colors.dangerStrong} />
        <Text style={styles.text}>{message}</Text>
      </View>
      {children}
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    box: {
      backgroundColor: colors.dangerLight,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      padding: spacing.sm + 2,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    text: {
      ...typography.bodySmall,
      color: colors.dangerStrong,
      flex: 1,
    },
  });

export default FormAlert;
