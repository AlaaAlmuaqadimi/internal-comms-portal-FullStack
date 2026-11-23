import React, { useMemo } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';

const CustomButton = ({
  title,
  onPress,
  variant = 'primary', // primary, secondary, outline, danger
  size = 'medium', // small, medium, large
  icon,
  // In reading order: 'start' = before the title (right of it in Arabic, left
  // in English), 'end' = after it. The row mirrors itself with the language.
  iconPosition = 'start',
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}) => {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconAtEnd = iconPosition === 'end';

  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[size]];

    switch (variant) {
      case 'primary':
        baseStyle.push(styles.primary);
        break;
      case 'secondary':
        baseStyle.push(styles.secondary);
        break;
      case 'outline':
        baseStyle.push(styles.outline);
        break;
      case 'danger':
        baseStyle.push(styles.danger);
        break;
      default:
        baseStyle.push(styles.primary);
    }

    if (disabled || loading) {
      baseStyle.push(styles.disabled);
    }

    return baseStyle;
  };

  // Icon and spinner follow the text colour of the variant (a white icon on the
  // light `secondary` surface used to be invisible).
  const contentColor =
    variant === 'outline'
      ? colors.primaryLight
      : variant === 'secondary'
        ? colors.text
        : colors.textWhite;
  const isInactive = disabled || loading;

  const getTextStyle = () => {
    const baseStyle = [styles.buttonText, styles[`${size}Text`]];

    switch (variant) {
      case 'primary':
      case 'danger':
        baseStyle.push(styles.primaryText);
        break;
      case 'secondary':
        baseStyle.push(styles.secondaryText);
        break;
      case 'outline':
        baseStyle.push(styles.outlineText);
        break;
      default:
        baseStyle.push(styles.primaryText);
    }

    return baseStyle;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      testID={testID}
      hitSlop={size === 'small' ? 6 : undefined}
      style={({ pressed }) => [
        ...getButtonStyle(),
        pressed && !isInactive && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.content, isRTL && styles.contentRtl]}>
        {loading ? (
          <ActivityIndicator size="small" color={contentColor} />
        ) : (
          <>
            {icon && !iconAtEnd && <Ionicons name={icon} size={20} color={contentColor} />}
            <Text style={[...getTextStyle(), textStyle]} numberOfLines={2}>
              {title}
            </Text>
            {icon && iconAtEnd && <Ionicons name={icon} size={20} color={contentColor} />}
          </>
        )}
      </View>
    </Pressable>
  );
};

const createStyles = (colors) => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  contentRtl: {
    flexDirection: 'row-reverse',
  },

  // Sizes (minimum heights keep every button an easy touch target)
  small: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  medium: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  large: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  // Variants
  primary: {
    backgroundColor: colors.primaryLight,
    // Tinted glow gives the main action depth without a hard border.
    shadowColor: colors.primaryLight,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  danger: {
    backgroundColor: colors.danger,
  },

  // Text styles
  buttonText: {
    ...typography.button,
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  primaryText: {
    color: colors.textWhite,
  },
  secondaryText: {
    color: colors.text,
  },
  outlineText: {
    color: colors.primaryLight,
  },

  // States
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },


});

export default CustomButton;
