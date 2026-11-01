import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import OrgUnitPicker from '../../components/OrgUnitPicker';
import { api, ApiError } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import {
  EDIT_FIELD_ORDER,
  validateEmployeeForm,
  validateField,
} from '../../utils/employeeValidation';

const AVAILABILITY_FIELDS = ['email', 'extension'];

/**
 * Edit Employee modal.
 *
 * Validation mirrors the Add Employee form (shared employeeValidation module)
 * and the backend zod schemas. The username is read-only; the password is
 * optional for employees that already have a login account.
 */
const EditEmployeeModal = ({
  visible,
  employee,
  orgTree = [],
  onClose,
  onSaved,
}) => {
  const { width, height } = useWindowDimensions();
  const { t, isRTL, language, align } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const isSmallScreen = width < 375;
  const isLandscape = width > height;

  const passwordOptional = !!employee?.hasAccount;
  const validationOptions = useMemo(
    () => ({ edit: true, passwordOptional }),
    [passwordOptional]
  );

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
  const [saving, setSaving] = useState(false);
  const [orgPickerVisible, setOrgPickerVisible] = useState(false);
  const [checkingFields, setCheckingFields] = useState({});

  const scrollRef = useRef(null);
  const scrollOffset = useRef(0);
  const fieldRefs = useRef({});
  const availabilityRequest = useRef({});
  const availabilitySession = useRef(0);

  const fieldRef = (field) => (node) => {
    fieldRefs.current[field] = node;
  };

  const clearError = useCallback((field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setFieldError = useCallback((field, message) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  // Re-seed the form every time the modal opens for an employee.
  useEffect(() => {
    if (!visible || !employee) return;

    setFormData({
      fullNameAr: employee.fullNameAr || '',
      fullNameEn: employee.fullNameEn || '',
      username: employee.username || '',
      password: '',
      confirmPassword: '',
      email: employee.email || '',
      jobTitleAr: employee.jobTitleAr || '',
      extension: employee.extension || '',
      roleCode: employee.roleCode || 'employee',
      orgUnitId: employee.orgUnitId || '',
    });
    setErrors({});
    setCheckingFields({});
    setOrgPickerVisible(false);
    availabilitySession.current += 1;
    availabilityRequest.current = {};
  }, [visible, employee]);

  const updateField = useCallback(
    (field) => (value) => {
      if (field === 'extension') {
        value = String(value).replace(/[^0-9]/g, '').slice(0, 32);
      }

      if (AVAILABILITY_FIELDS.includes(field)) {
        availabilityRequest.current[field] = (availabilityRequest.current[field] || 0) + 1;
        setCheckingFields((prev) => (prev[field] ? { ...prev, [field]: false } : prev));
      }

      setFormData((prev) => ({ ...prev, [field]: value }));
      clearError(field);
      clearError('general');
      if (field === 'password') clearError('confirmPassword');
    },
    [clearError]
  );

  const checkAvailability = useCallback(
    async (field) => {
      const value = formData[field].trim();
      if (!value) return;
      if (validateField(field, formData, t, validationOptions)) return;

      const requestId = (availabilityRequest.current[field] || 0) + 1;
      availabilityRequest.current[field] = requestId;
      const session = availabilitySession.current;
      setCheckingFields((prev) => ({ ...prev, [field]: true }));

      try {
        const result = await api.auth.checkAvailability(field, value, {
          excludeEmployeeId: employee?.id,
        });
        if (availabilitySession.current !== session) return;
        if (availabilityRequest.current[field] !== requestId) return;
        if (!result.available) {
          setFieldError(
            field,
            field === 'email' ? t('addUser.emailTaken') : t('addUser.extensionTaken')
          );
        }
      } catch {
        // Non-blocking: the PATCH request performs the authoritative check.
      } finally {
        if (
          availabilitySession.current === session &&
          availabilityRequest.current[field] === requestId
        ) {
          setCheckingFields((prev) => ({ ...prev, [field]: false }));
        }
      }
    },
    [formData, t, validationOptions, setFieldError, employee?.id]
  );

  const handleBlur = useCallback(
    (field) => {
      const message = validateField(field, formData, t, validationOptions);
      if (message) {
        setFieldError(field, message);
        return;
      }

      clearError(field);

      if (field === 'password' && formData.confirmPassword) {
        const confirmError = validateField(
          'confirmPassword',
          formData,
          t,
          validationOptions
        );
        if (confirmError) setFieldError('confirmPassword', confirmError);
      }

      if (AVAILABILITY_FIELDS.includes(field)) {
        checkAvailability(field);
      }
    },
    [formData, t, validationOptions, clearError, setFieldError, checkAvailability]
  );

  const roleOptions = useMemo(
    () => [
      { value: 'admin', label: t('directory.admin') },
      { value: 'employee', label: t('directory.employee') },
    ],
    [t]
  );

  const selectedOrgPath = useMemo(() => {
    if (!formData.orgUnitId) return [];

    const findPath = (nodes, trail) => {
      for (const unit of nodes || []) {
        const nextTrail = [...trail, unit];
        if (unit.id === formData.orgUnitId) return nextTrail;
        const match = findPath(unit.children, nextTrail);
        if (match) return match;
      }
      return null;
    };

    return findPath(orgTree, []) || [];
  }, [orgTree, formData.orgUnitId]);

  const selectedOrgUnitName = useMemo(() => {
    const unit = selectedOrgPath[selectedOrgPath.length - 1];
    return unit
      ? localizeText(unit.nameAr || unit.nameEn || unit.code)
      : '';
  }, [selectedOrgPath, language]);

  const selectedOrgPathLabel = useMemo(() => {
    const arrow = isRTL ? '\u2190' : '\u2192';
    return selectedOrgPath
      .map((unit) => localizeText(unit.nameAr || unit.nameEn || unit.code))
      .join(` ${arrow} `);
  }, [selectedOrgPath, isRTL, language]);

  const scrollToFirstError = (errorMap) => {
    const first = EDIT_FIELD_ORDER.find((field) => errorMap[field]);
    if (!first) return;

    const node = fieldRefs.current[first];
    const scrollView = scrollRef.current;
    if (!node || !scrollView) return;
    if (typeof node.measureInWindow !== 'function') return;

    node.measureInWindow((_x, y) => {
      if (typeof scrollView.measureInWindow !== 'function') return;
      scrollView.measureInWindow((_sx, sy) => {
        const target = scrollOffset.current + (y - sy) - spacing.md;
        scrollView.scrollTo({ y: Math.max(0, target), animated: true });
      });
    });
  };

  const applyServerError = (error) => {
    if (!(error instanceof ApiError)) {
      setErrors({ general: t('editEmployee.error') });
      return;
    }

    const byCode = {
      EMAIL_TAKEN: { field: 'email', message: t('addUser.emailTaken') },
      EXTENSION_TAKEN: { field: 'extension', message: t('addUser.extensionTaken') },
      EMPLOYEE_NOT_FOUND: { general: t('editEmployee.notFound') },
    };

    if (error.code && byCode[error.code]) {
      const mapped = byCode[error.code];
      if (mapped.general) {
        setErrors(mapped);
        return;
      }
      const next = { [mapped.field]: mapped.message };
      setErrors(next);
      scrollToFirstError(next);
      return;
    }

    const fieldErrors = {};
    if (Array.isArray(error.details)) {
      for (const detail of error.details) {
        if (!detail || !detail.field || !EDIT_FIELD_ORDER.includes(detail.field)) continue;
        if (!fieldErrors[detail.field]) fieldErrors[detail.field] = detail.message;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      scrollToFirstError(fieldErrors);
      return;
    }

    if (error.status === 403) {
      setErrors({ general: t('editEmployee.forbidden') });
      return;
    }

    setErrors({ general: error.message || t('editEmployee.error') });
  };

  const handleSubmit = async () => {
    if (saving || !employee) return;

    const nextErrors = validateEmployeeForm(formData, t, validationOptions);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      scrollToFirstError(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const payload = {
        fullNameAr: formData.fullNameAr.trim(),
        fullNameEn: formData.fullNameEn.trim(),
        jobTitleAr: formData.jobTitleAr.trim(),
        email: formData.email.trim(),
        extension: formData.extension.trim(),
        roleCode: formData.roleCode,
        orgUnitId: formData.orgUnitId,
      };
      if (formData.password) payload.password = formData.password;

      const result = await api.employees.update(employee.id, payload);
      onSaved?.(result.employee || { ...employee, ...payload });
    } catch (error) {
      applyServerError(error);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    onClose?.();
  };

  const passwordHint = passwordOptional
    ? t('editEmployee.passwordKeep')
    : t('editEmployee.passwordCreateAccount');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <Pressable
              onPress={close}
              style={styles.closeButton}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={24} color={colors.textWhite} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{t('editEmployee.title')}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {employee?.fullNameAr || t('editEmployee.subtitle')}
              </Text>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              isLandscape && styles.scrollContentLandscape,
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              scrollOffset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <View style={styles.form}>
              {errors.general && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              )}

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('addUser.accountInfo')}
                </Text>

                <View ref={fieldRef('fullNameAr')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.fullName')}
                    value={formData.fullNameAr}
                    onChangeText={updateField('fullNameAr')}
                    onBlur={() => handleBlur('fullNameAr')}
                    placeholder={t('addUser.fullNamePlaceholder')}
                    maxLength={100}
                    required
                    error={errors.fullNameAr}
                    icon="person"
                  />
                </View>

                <View ref={fieldRef('fullNameEn')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.fullNameEn')}
                    value={formData.fullNameEn}
                    onChangeText={updateField('fullNameEn')}
                    onBlur={() => handleBlur('fullNameEn')}
                    placeholder={t('addUser.fullNameEnPlaceholder')}
                    maxLength={100}
                    required
                    error={errors.fullNameEn}
                    icon="text"
                  />
                </View>

                <View ref={fieldRef('username')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.username')}
                    value={formData.username}
                    placeholder={t('addUser.usernamePlaceholder')}
                    disabled
                    error={errors.username}
                    hint={t('editEmployee.usernameLocked')}
                    icon="at"
                  />
                </View>

                <View ref={fieldRef('password')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.password')}
                    value={formData.password}
                    onChangeText={updateField('password')}
                    onBlur={() => handleBlur('password')}
                    placeholder={
                      passwordOptional
                        ? t('editEmployee.passwordPlaceholderKeep')
                        : t('addUser.passwordPlaceholder')
                    }
                    secureTextEntry
                    maxLength={200}
                    required={!passwordOptional}
                    error={errors.password}
                    hint={passwordHint}
                    icon="lock-closed"
                  />
                </View>

                <View ref={fieldRef('confirmPassword')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.confirmPassword')}
                    value={formData.confirmPassword}
                    onChangeText={updateField('confirmPassword')}
                    onBlur={() => handleBlur('confirmPassword')}
                    placeholder={t('addUser.confirmPasswordPlaceholder')}
                    secureTextEntry
                    maxLength={200}
                    required={!passwordOptional}
                    error={errors.confirmPassword}
                    icon="lock-closed"
                  />
                </View>

                <View ref={fieldRef('email')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.email')}
                    value={formData.email}
                    onChangeText={updateField('email')}
                    onBlur={() => handleBlur('email')}
                    placeholder={t('addUser.emailPlaceholder')}
                    keyboardType="email-address"
                    maxLength={255}
                    required
                    error={errors.email}
                    hint={
                      checkingFields.email ? t('addUser.availabilityChecking') : undefined
                    }
                    icon="mail"
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('addUser.orgInfo')}
                </Text>

                <View ref={fieldRef('jobTitleAr')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.jobTitle')}
                    value={formData.jobTitleAr}
                    onChangeText={updateField('jobTitleAr')}
                    onBlur={() => handleBlur('jobTitleAr')}
                    placeholder={t('addUser.jobTitlePlaceholder')}
                    maxLength={255}
                    required
                    error={errors.jobTitleAr}
                    icon="briefcase"
                  />
                </View>

                <View ref={fieldRef('extension')} collapsable={false}>
                  <CustomInput
                    label={t('addUser.extension')}
                    value={formData.extension}
                    onChangeText={updateField('extension')}
                    onBlur={() => handleBlur('extension')}
                    placeholder={t('addUser.extensionPlaceholder')}
                    keyboardType="number-pad"
                    maxLength={32}
                    required
                    error={errors.extension}
                    hint={
                      checkingFields.extension
                        ? t('addUser.availabilityChecking')
                        : undefined
                    }
                    icon="call"
                  />
                </View>

                <View ref={fieldRef('roleCode')} collapsable={false}>
                  <SelectField
                    label={t('addUser.role')}
                    value={formData.roleCode}
                    options={roleOptions}
                    onSelect={updateField('roleCode')}
                    placeholder={t('addUser.rolePlaceholder')}
                    required
                    error={errors.roleCode}
                    emptyText={t('org.noOptions')}
                  />
                </View>

                <View ref={fieldRef('orgUnitId')} collapsable={false} style={styles.orgUnitField}>
                  <Text style={styles.orgUnitLabel}>
                    {t('addUser.orgUnit')}
                    <Text style={styles.orgUnitRequired}> *</Text>
                  </Text>

                  <Pressable
                    onPress={() => {
                      if (!orgTree.length) return;
                      setOrgPickerVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: orgPickerVisible }}
                    style={[
                      styles.orgUnitTrigger,
                      errors.orgUnitId && styles.orgUnitTriggerError,
                    ]}
                  >
                    {orgTree.length === 0 ? (
                      <ActivityIndicator size="small" color={colors.primaryLight} />
                    ) : null}
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.orgUnitValue,
                        { textAlign: align },
                        !selectedOrgUnitName && styles.orgUnitPlaceholder,
                      ]}
                    >
                      {selectedOrgUnitName || t('addUser.orgUnitPlaceholder')}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>

                  {errors.orgUnitId ? (
                    <Text style={styles.orgUnitError}>{errors.orgUnitId}</Text>
                  ) : selectedOrgPathLabel ? (
                    <Text style={[styles.orgUnitHint, { textAlign: align }]}>
                      {selectedOrgPathLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <CustomButton
              title={t('common.cancel')}
              onPress={close}
              variant="outline"
              disabled={saving}
              style={styles.footerButton}
            />
            <CustomButton
              title={t('editEmployee.save')}
              onPress={handleSubmit}
              loading={saving}
              disabled={saving}
              icon="save"
              iconPosition="left"
              style={styles.footerButton}
            />
          </View>
        </KeyboardAvoidingView>

        <OrgUnitPicker
          inline
          visible={orgPickerVisible}
          units={orgTree}
          selectedId={formData.orgUnitId}
          onSelect={(unitId) => {
            setFormData((prev) => ({ ...prev, orgUnitId: unitId }));
            clearError('orgUnitId');
            clearError('general');
          }}
          onClose={() => setOrgPickerVisible(false)}
          title={t('addUser.orgUnit')}
        />
      </SafeAreaView>
    </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceDark,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
    padding: spacing.md,
  },
  closeButton: {
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
  scrollContent: {
    flexGrow: 1,
    padding: spacing.md,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
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
    color: colors.dangerStrong,
    textAlign: 'center',
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
  orgUnitField: {
    marginBottom: spacing.md,
  },
  orgUnitLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  orgUnitRequired: {
    color: colors.dangerStrong,
  },
  orgUnitTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  orgUnitTriggerError: {
    borderColor: colors.dangerStrong,
  },
  orgUnitValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  orgUnitPlaceholder: {
    color: colors.textLight,
  },
  orgUnitError: {
    ...typography.caption,
    color: colors.dangerStrong,
    marginTop: spacing.xs,
  },
  orgUnitHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
  },
});

export default EditEmployeeModal;
