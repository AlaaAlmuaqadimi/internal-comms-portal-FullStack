import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from './AppText';
import Modal from './Modal';
import CustomInput from './CustomInput';
import CustomButton from './CustomButton';
import FormAlert from './FormAlert';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';
import { api } from '../services/api';

// Same rule as the server (and as the admin's add-user form).
const MIN_PASSWORD_LENGTH = 8;
const EMPTY_FORM = { current: '', next: '', confirm: '' };

function validate(form, t) {
  const errors = {};
  if (!form.current) errors.current = t('settings.currentPasswordRequired');
  if (form.next.length < MIN_PASSWORD_LENGTH) {
    errors.next = t('settings.newPasswordTooShort');
  } else if (form.next === form.current) {
    errors.next = t('settings.newPasswordSameAsCurrent');
  }
  if (!errors.next && form.confirm !== form.next) {
    errors.confirm = t('settings.passwordsDoNotMatch');
  }
  return errors;
}

/**
 * Change-password window opened from Settings. The obvious mistakes are caught
 * before the server is called; the server's answer is then shown under the
 * field it is about (for example a wrong current password).
 */
const ChangePasswordModal = ({ visible, onClose, onChanged }) => {
  const { t, isRTL, align } = useLanguage();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Every opening starts empty: passwords are never kept between openings.
  useEffect(() => {
    if (visible) {
      setForm(EMPTY_FORM);
      setErrors({});
      setFormError('');
      setSaving(false);
    }
  }, [visible]);

  const update = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setFormError('');
  };

  const close = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    const nextErrors = validate(form, t);
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await api.auth.changePassword(form.current, form.next);
      setSaving(false);
      onChanged?.();
      onClose();
    } catch (err) {
      setSaving(false);
      if (err?.code === 'INVALID_CURRENT_PASSWORD') {
        setErrors({ current: t('settings.currentPasswordWrong') });
      } else if (err?.code === 'RATE_LIMITED') {
        setFormError(t('settings.passwordTooManyAttempts'));
      } else if (err?.status === 404) {
        // The server does not offer POST /api/auth/change-password yet.
        setFormError(t('settings.passwordChangeUnavailable'));
      } else {
        setFormError(err?.message || t('settings.passwordChangeError'));
      }
    }
  };

  return (
    <Modal visible={visible} onClose={close} title={t('settings.changePassword')}>
      <ScrollView
        style={{ maxHeight: Math.round(height * 0.7) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.hint, { textAlign: align }]}>{t('settings.changePasswordHint')}</Text>

        <FormAlert message={formError} style={styles.alert} />

        <CustomInput
          label={t('settings.currentPassword')}
          value={form.current}
          onChangeText={update('current')}
          placeholder={t('settings.currentPasswordPlaceholder')}
          icon="lock-closed-outline"
          secureTextEntry
          maxLength={200}
          error={errors.current}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="next"
          disabled={saving}
          required
        />
        <CustomInput
          label={t('settings.newPassword')}
          value={form.next}
          onChangeText={update('next')}
          placeholder={t('settings.newPasswordPlaceholder')}
          icon="key-outline"
          secureTextEntry
          maxLength={200}
          error={errors.next}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          disabled={saving}
          required
        />
        <CustomInput
          label={t('settings.confirmNewPassword')}
          value={form.confirm}
          onChangeText={update('confirm')}
          placeholder={t('settings.confirmNewPasswordPlaceholder')}
          icon="key-outline"
          secureTextEntry
          maxLength={200}
          error={errors.confirm}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleSave}
          disabled={saving}
          required
        />

        <CustomButton
          title={t('settings.savePassword')}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          icon="checkmark"
          style={styles.button}
        />
      </ScrollView>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    hint: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'left',
      marginBottom: spacing.md,
    },
    alert: {
      marginBottom: spacing.md,
    },
    button: {
      marginTop: spacing.xs,
    },
  });

export default ChangePasswordModal;
