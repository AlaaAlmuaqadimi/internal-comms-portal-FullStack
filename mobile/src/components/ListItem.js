import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

const ListItem = ({
  title,
  subtitle,
  description,
  icon,
  iconColor,
  iconBackgroundColor,
  rightComponent,
  onPress,
  showArrow = false,
  style,
}) => {
  const { isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );
  const resolvedIconColor = iconColor || colors.primaryLight;
  const resolvedIconBackground = iconBackgroundColor || colors.iconSurface;
  const content = (
    <View style={styles.content}>
      {icon && (
        <View style={[styles.iconContainer, { backgroundColor: resolvedIconBackground }]}>
          <Ionicons name={icon} size={24} color={resolvedIconColor} />
        </View>
      )}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      {rightComponent}
      {showArrow && (
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.textLight} style={styles.arrow} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {content}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 4,
  },
  arrow: {
    marginRight: spacing.sm,
  },
});

export default ListItem;
