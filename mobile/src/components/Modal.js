import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal as RNModal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
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
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.container, getSizeStyle(), style]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {showClose && (
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            )}
          </View>
          <View style={styles.content}>
            {children}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
};

const styles = StyleSheet.create({
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
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.md,
  },
});

export default Modal;
