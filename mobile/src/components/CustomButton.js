import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';

const CustomButton = ({
  title,
  onPress,
  variant = 'primary', // primary, secondary, outline, danger
  size = 'medium', // small, medium, large
  icon,
  iconPosition = 'right',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
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
      disabled={disabled || loading}
      style={({ pressed }) => [
        ...getButtonStyle(),
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'outline' ? colors.primaryLight : colors.textWhite} 
          />
        ) : (
          <>
            {icon && iconPosition === 'right' && (
              <Ionicons name={icon} size={20} color={variant === 'outline' ? colors.primaryLight : colors.textWhite} style={styles.iconRight} />
            )}
            <Text style={[...getTextStyle(), textStyle]}>{title}</Text>
            {icon && iconPosition === 'left' && (
              <Ionicons name={icon} size={20} color={variant === 'outline' ? colors.primaryLight : colors.textWhite} style={styles.iconLeft} />
            )}
          </>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
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
  },
  
  // Sizes
  small: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  medium: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  large: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  
  // Variants
  primary: {
    backgroundColor: colors.primaryLight,
  },
  secondary: {
    backgroundColor: colors.surface,
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
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  
  // Icons
  iconRight: {
    marginLeft: spacing.xs,
  },
  iconLeft: {
    marginRight: spacing.xs,
  },
});

export default CustomButton;
