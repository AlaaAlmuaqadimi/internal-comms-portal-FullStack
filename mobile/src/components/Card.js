import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/spacing';

const Card = ({
  children,
  onPress,
  variant = 'default', // default, elevated, outlined
  style,
  contentStyle,
}) => {
  const getCardStyle = () => {
    const baseStyle = [styles.card];
    
    switch (variant) {
      case 'elevated':
        baseStyle.push(styles.elevated);
        break;
      case 'outlined':
        baseStyle.push(styles.outlined);
        break;
      default:
        baseStyle.push(styles.default);
    }
    
    return baseStyle;
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...getCardStyle(),
          pressed && styles.pressed,
          style,
        ]}
      >
        <View style={[styles.content, contentStyle]}>
          {children}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[...getCardStyle(), style]}>
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  default: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    padding: spacing.md,
  },
});

export default Card;
