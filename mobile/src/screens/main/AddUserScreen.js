import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { api, ApiError } from '../../services/api';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import { flipStyles } from '../../i18n/rtlStyles';
import { localizeText } from '../../i18n/localize';

const USERNAME_RE = /^[a-zA-Z0-9._]+$/;

const AddUserScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { createUser } = useAuth();
  const { t, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const isSmallScreen = width < 375;
  const isLandscape = width > height;

  const [formData, setFormData] = useState({
    fullNameAr: '',
    fullNameEn: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    jobTitleAr: '',
    extension: '',
    roleCode: '',
    orgUnitId: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [roles, setRoles] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const [roleList, unitList] = await Promise.all([
        api.auth.listRoles(),
        api.auth.listOrgUnits(),
      ]);
      // admin is provisioned out-of-band; it can never be granted here.
      setRoles(roleList.filter((r) => r.code !== 'admin'));
      setOrgUnits(unitList);
    } catch (error) {
      setOptionsError(error.message || t('addUser.error'));
    } finally {
      setOptionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const update = (field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullNameAr.trim()) {
      newErrors.fullNameAr = t('addUser.nameRequired');
    }

    const username = formData.username.trim();
    if (!username) {
      newErrors.username = t('validation.usernameRequired');
    } else if (username.length < 3) {
      newErrors.username = t('validation.usernameMin');
    } else if (username.length > 30) {
      newErrors.username = t('validation.usernameMax');
    } else if (!USERNAME_RE.test(username)) {
      newErrors.username = t('validation.usernameInvalid');
    }

    if (!formData.password) {
      newErrors.password = t('validation.passwordRequired');
    } else if (formData.password.length < 8) {
      newErrors.password = t('validation.passwordMin');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('validation.confirmPasswordRequired');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('validation.passwordsMismatch');
    }

    if (!formData.roleCode) {
      newErrors.roleCode = t('addUser.roleRequired');
    }

    if (!formData.orgUnitId) {
      newErrors.orgUnitId = t('addUser.unitRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setErrors({});
    setLoading(true);
    try {
      await createUser({
        username: formData.username.trim(),
        password: formData.password,
        fullNameAr: formData.fullNameAr.trim(),
        fullNameEn: formData.fullNameEn.trim() || undefined,
        email: formData.email.trim() || undefined,
        jobTitleAr: formData.jobTitleAr.trim() || undefined,
        extension: formData.extension.trim() || undefined,
        roleCode: formData.roleCode,
        orgUnitId: formData.orgUnitId,
      });
      navigation.goBack();
    } catch (error) {
      let message = t('addUser.error');
      if (error instanceof ApiError) {
        if (error.status === 409) message = t('addUser.duplicate');
        else if (error.status === 403) message = t('addUser.forbidden');
        else if (error.status === 422 && error.details?.length) message = error.details[0].message;
        else if (error.message) message = error.message;
      }
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  };

  const unitLabel = (unit) =>
    localizeText(unit.name_ar || unit.name_en || unit.code);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
              <Ionicons
                name={isRTL ? 'arrow-forward' : 'arrow-back'}
                size={24}
                color={colors.textWhite}
              />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{t('addUser.title')}</Text>
              <Text style={styles.headerSubtitle}>{t('addUser.subtitle')}</Text>
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.form}>
              {errors.general && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              )}

              {optionsError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{optionsError}</Text>
                  <CustomButton
                    title={t('common.retry', { defaultValue: 'Retry' })}
                    onPress={loadOptions}
                    variant="outline"
                    size="small"
                    style={styles.retryButton}
                  />
                </View>
              )}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('addUser.accountInfo')}
                </Text>

                <CustomInput
                  label={t('addUser.fullName')}
                  value={formData.fullNameAr}
                  onChangeText={update('fullNameAr')}
                  placeholder={t('addUser.fullNamePlaceholder')}
                  required
                  error={errors.fullNameAr}
                  icon="person"
                />

                <CustomInput
                  label={t('addUser.fullNameEn')}
                  value={formData.fullNameEn}
                  onChangeText={update('fullNameEn')}
                  placeholder={t('addUser.fullNameEnPlaceholder')}
                  icon="text"
                />

                <CustomInput
                  label={t('addUser.username')}
                  value={formData.username}
                  onChangeText={update('username')}
                  placeholder={t('addUser.usernamePlaceholder')}
                  autoCapitalize="none"
                  required
                  error={errors.username}
                  hint={t('addUser.usernameHint')}
                  icon="at"
                />

                <CustomInput
                  label={t('addUser.password')}
                  value={formData.password}
                  onChangeText={update('password')}
                  placeholder={t('addUser.passwordPlaceholder')}
                  secureTextEntry
                  required
                  error={errors.password}
                  hint={t('addUser.passwordHint')}
                  icon="lock-closed"
                />

                <CustomInput
                  label={t('addUser.confirmPassword')}
                  value={formData.confirmPassword}
                  onChangeText={update('confirmPassword')}
                  placeholder={t('addUser.confirmPasswordPlaceholder')}
                  secureTextEntry
                  required
                  error={errors.confirmPassword}
                  icon="lock-closed"
                />

                <CustomInput
                  label={t('addUser.email')}
                  value={formData.email}
                  onChangeText={update('email')}
                  placeholder={t('addUser.emailPlaceholder')}
                  keyboardType="email-address"
                  icon="mail"
                />
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('addUser.orgInfo')}
                </Text>

                <CustomInput
                  label={t('addUser.jobTitle')}
                  value={formData.jobTitleAr}
                  onChangeText={update('jobTitleAr')}
                  placeholder={t('addUser.jobTitlePlaceholder')}
                  icon="briefcase"
                />

                <CustomInput
                  label={t('addUser.extension')}
                  value={formData.extension}
                  onChangeText={update('extension')}
                  placeholder={t('addUser.extensionPlaceholder')}
                  keyboardType="number-pad"
                  maxLength={6}
                  icon="call"
                />

                {optionsLoading ? (
                  <View style={styles.optionsLoading}>
                    <ActivityIndicator size="small" color={colors.primaryLight} />
                    <Text style={styles.optionsLoadingText}>{t('addUser.loadingOptions')}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.pickerLabel}>
                      {t('addUser.role')}
                      <Text style={styles.required}> *</Text>
                    </Text>
                    <View style={styles.optionsWrap}>
                      {roles.map((role) => {
                        const selected = formData.roleCode === role.code;
                        return (
                          <Pressable
                            key={role.code}
                            onPress={() => update('roleCode')(role.code)}
                            style={[styles.optionChip, selected && styles.optionChipSelected]}
                          >
                            <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                              {localizeText(role.name_ar || role.name_en || role.code)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {errors.roleCode && <Text style={styles.fieldError}>{errors.roleCode}</Text>}

                    <Text style={[styles.pickerLabel, styles.pickerLabelSpaced]}>
                      {t('addUser.orgUnit')}
                      <Text style={styles.required}> *</Text>
                    </Text>
                    <View style={styles.unitsList}>
                      {orgUnits.map((unit) => {
                        const selected = formData.orgUnitId === unit.id;
                        return (
                          <Pressable
                            key={unit.id}
                            onPress={() => update('orgUnitId')(unit.id)}
                            style={[styles.unitItem, selected && styles.unitItemSelected]}
                          >
                            <Text
                              style={[styles.unitText, selected && styles.unitTextSelected]}
                              numberOfLines={1}
                            >
                              {unitLabel(unit)}
                            </Text>
                            {selected && (
                              <Ionicons name="checkmark-circle" size={18} color={colors.primaryLight} />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                    {errors.orgUnitId && <Text style={styles.fieldError}>{errors.orgUnitId}</Text>}
                  </>
                )}
              </View>

              <CustomButton
                title={t('addUser.submit')}
                onPress={handleSubmit}
                loading={loading}
                disabled={optionsLoading || !!optionsError}
                icon="person-add"
                style={styles.submitButton}
                iconPosition="left"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const rawStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
 header: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  backgroundColor: colors.surfaceDark,
  borderBottomWidth: 4,
  borderBottomColor: colors.accent,
  padding: spacing.md,
},
backButton: {
  padding: spacing.xs,
},
  headerText: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textWhite,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textGold,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  errorContainer: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5b3a6',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: '#8a3a24',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionTitleSmall: {
    fontSize: 16,
  },
  optionsLoading: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.sm,
  paddingVertical: spacing.md,
},
optionsLoadingText: {
  ...typography.bodySmall,
  color: colors.textSecondary,
},

  pickerLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  pickerLabelSpaced: {
    marginTop: spacing.md,
  },
  required: {
    color: colors.danger,
  },
  optionsWrap: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: spacing.xs,
},
optionChip: {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: borderRadius.lg,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: colors.surface,
},
  optionChipSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: '#f5f9fc',
  },
  optionChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  optionChipTextSelected: {
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
  unitsList: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  unitItemSelected: {
    backgroundColor: '#f5f9fc',
  },
  unitText: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
  },
  unitTextSelected: {
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});

export default AddUserScreen;
