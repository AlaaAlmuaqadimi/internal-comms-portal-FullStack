import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import Modal from './Modal';
import CustomButton from './CustomButton';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

const ConfirmDialog = ({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'danger', // danger, primary
  icon,
  loading = false,
}) => {
  const { t, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={title}
      showClose={false}
      size="small"
    >
      <View style={styles.content}>
        {icon && (
          <View style={[styles.iconContainer, variant === 'danger' && styles.iconContainerDanger]}>
            <Ionicons 
              name={icon} 
              size={32} 
              color={variant === 'danger' ? colors.danger : colors.primaryLight} 
            />
          </View>
        )}
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
        <View style={styles.actions}>
          <CustomButton
            title={confirmText || t('common.confirm')}
            onPress={onConfirm}
            variant={variant}
            loading={loading}
            style={styles.button}
          />
          <CustomButton
            title={cancelText || t('common.cancel')}
            onPress={onClose}
            variant="outline"
            style={styles.button}
          />
        </View>
      </View>
    </Modal>
  );
};

const rawStyles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eaf1f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconContainerDanger: {
    backgroundColor: colors.dangerLight,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  button: {
    flex: 1,
  },
});

export default ConfirmDialog;
