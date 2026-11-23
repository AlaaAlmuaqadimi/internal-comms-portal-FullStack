import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { FadeInView } from './Motion';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import CustomButton from './CustomButton';

const EmptyState = ({
  icon = 'search-x',
  title,
  description,
  actionTitle,
  onAction,
  style,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <FadeInView style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={48} color={colors.primaryLight} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionTitle && onAction && (
        <CustomButton
          title={actionTitle}
          onPress={onAction}
          variant="primary"
          style={styles.button}
        />
      )}
    </FadeInView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.iconSurface,
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

export default EmptyState;
