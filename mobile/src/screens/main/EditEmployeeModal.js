import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import OrgUnitPicker from '../../components/OrgUnitPicker';
import ScreenHeader from '../../components/ScreenHeader';
import FormSection from '../../components/FormSection';
import PickerField from '../../components/PickerField';
import FormAlert from '../../components/FormAlert';
import { api, ApiError } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import UnitHeadToggle, { canHaveHead, otherHeadName } from '../../components/UnitHeadToggle';
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
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

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
    isUnitHead: false,
    isActive: true,
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
      isUnitHead: employee.isUnitHead === true,
      isActive: employee.isActive !== false,
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

  const selectedOrgUnit = selectedOrgPath[selectedOrgPath.length - 1] || null;

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

    if (typeof error.code === 'string' && error.code.startsWith('UNIT_HEAD_')) {
      setErrors({ general: error.details?.[0]?.message || error.message });
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
        isActive: formData.isActive,
        isUnitHead: canHaveHead(selectedOrgUnit) && formData.isUnitHead,
        replaceUnitHead: Boolean(otherHeadName(selectedOrgUnit, employee.id, language)),
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
          <ScreenHeader
            title={t('editEmployee.title')}
            subtitle={employee?.fullNameAr || t('editEmployee.subtitle')}
            onBack={close}
            variant="close"
          />

          <ScrollView
            keyboardDismissMode="on-drag"
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
            <View>
              <FormAlert message={errors.general} />

              <FormSection delay={0} icon="person-outline" title={t('addUser.personalInfo')}>
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
              </FormSection>

              <FormSection delay={70} icon="key-outline" title={t('addUser.loginInfo')}>
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
              </FormSection>

              <FormSection delay={140} icon="briefcase-outline" title={t('addUser.orgInfo')}>

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

                <View ref={fieldRef('orgUnitId')} collapsable={false}>
                  <PickerField
                    label={t('addUser.orgUnit')}
                    required
                    value={selectedOrgUnitName}
                    placeholder={t('addUser.orgUnitPlaceholder')}
                    onPress={() => {
                      if (!orgTree.length) return;
                      setOrgPickerVisible(true);
                    }}
                    loading={orgTree.length === 0}
                    error={errors.orgUnitId}
                    hint={selectedOrgPathLabel}
                    expanded={orgPickerVisible}
                  />

                  <UnitHeadToggle
                    unit={selectedOrgUnit}
                    value={formData.isUnitHead}
                    employeeId={employee?.id}
                    onChange={(isUnitHead) => {
                      setFormData((prev) => ({ ...prev, isUnitHead }));
                      clearError('general');
                    }}
                  />
                </View>
              </FormSection>

              <FormSection delay={210} icon="shield-checkmark-outline" title={t('editEmployee.accountStatus')}>
                <View style={styles.statusCard}>
                  <View
                    style={[
                      styles.statusIcon,
                      formData.isActive ? styles.statusIconActive : styles.statusIconInactive,
                    ]}
                  >
                    <Ionicons
                      name={formData.isActive ? 'shield-checkmark' : 'shield-outline'}
                      size={20}
                      color={formData.isActive ? colors.success : colors.danger}
                    />
                  </View>

                  <View style={styles.statusText}>
                    <Text style={[styles.statusTitle, { textAlign: align }]}>
                      {formData.isActive
                        ? t('editEmployee.activeStatus')
                        : t('editEmployee.inactiveStatus')}
                    </Text>
                    <Text style={[styles.statusHint, { textAlign: align }]}>
                      {t('editEmployee.accountStatusHint')}
                    </Text>
                  </View>

                  <Switch
                    value={formData.isActive}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, isActive: value }));
                      clearError('general');
                    }}
                    trackColor={{ false: colors.borderDark, true: colors.success }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.borderDark}
                    accessibilityLabel={t('editEmployee.accountStatus')}
                    accessibilityRole="switch"
                  />
                </View>

                {!formData.isActive ? (
                  <View style={styles.deactivateNotice}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color={colors.dangerStrong}
                    />
                    <Text style={styles.deactivateNoticeText}>
                      {t('editEmployee.deactivateWarning')}
                    </Text>
                  </View>
                ) : null}
              </FormSection>
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
            setFormData((prev) => ({
              ...prev,
              orgUnitId: unitId,
              isUnitHead: prev.orgUnitId === unitId ? prev.isUnitHead : false,
            }));
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

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconActive: {
    backgroundColor: colors.successLight,
  },
  statusIconInactive: {
    backgroundColor: colors.dangerLight,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  statusHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  deactivateNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerLight,
  },
  deactivateNoticeText: {
    ...typography.caption,
    color: colors.dangerStrong,
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
  },
});

export default EditEmployeeModal;
