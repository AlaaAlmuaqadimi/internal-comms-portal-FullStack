import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Modal as RNModal,
} from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { ScaleInView } from './Motion';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';

const Modal = ({
  visible,
  onClose,
  title,
  children,
  showClose = true,
  size = 'medium', // small, medium, large
  style,
}) => {
  const { colors } = useTheme();
  const { t, isRTL, align } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return { maxWidth: 300 };
      case 'large':
        return { maxWidth: 500 };
      default:
        return { maxWidth: 400 };
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* The backdrop is a sibling of the card, not a parent: a Pressable
            wrapping the content steals touches from nested scroll views. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <ScaleInView style={[styles.container, getSizeStyle(), style]} accessibilityViewIsModal>
          {/* Title at the start and the close button at the end, mirrored in Arabic. */}
          <View style={[styles.header, isRTL && styles.headerRtl]}>
            <Text style={[styles.title, { textAlign: align }]} accessibilityRole="header">
              {title}
            </Text>
            {showClose && (
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            )}
          </View>
          <View style={styles.content}>{children}</View>
        </ScaleInView>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  container: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRtl: {
    flexDirection: 'row-reverse',
  },
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.full,
  },
  closePressed: {
    backgroundColor: colors.border,
  },
  content: {
    padding: spacing.md,
  },
});

export default Modal;
