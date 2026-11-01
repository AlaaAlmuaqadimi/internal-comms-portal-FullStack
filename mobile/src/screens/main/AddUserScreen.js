import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { api, ApiError } from '../../services/api';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import { flipStyles } from '../../i18n/rtlStyles';
import { localizeText } from '../../i18n/localize';
import {
  FIELD_ORDER,
  ROLE_VALUES,
  validateField,
  validateEmployeeForm,
  previewUsernameLocally,
} from '../../utils/employeeValidation';

const ENGLISH_NAME_RE = /^[A-Za-z ]+$/;
const USERNAME_CHECK_DEBOUNCE = 400;
const AVAILABILITY_FIELDS = ['email', 'extension'];

const AddUserScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { createUser } = useAuth();
  const { t, isRTL, language, align } = useLanguage();
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
  const [savedUsername, setSavedUsername] = useState('');

  const [roles, setRoles] = useState([]);
  const [orgTree, setOrgTree] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [orgModalVisible, setOrgModalVisible] = useState(false);
  const [orgQuery, setOrgQuery] = useState('');
  const [expandedOrgIds, setExpandedOrgIds] = useState(() => new Set());

  // Username generation state: idle -> checking -> ready.
  const [usernameState, setUsernameState] = useState('idle');
  const [checkingFields, setCheckingFields] = useState({});

  const scrollRef = useRef(null);
  const scrollOffset = useRef(0);
  const fieldRefs = useRef({});
  const usernameRequest = useRef(0);
  const availabilityRequest = useRef({});

  const fieldRef = (field) => (node) => {
    fieldRefs.current[field] = node;
  };

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const [roleList, unitTree] = await Promise.all([
        api.auth.listRoles(),
        api.org.getTree(),
      ]);
      // Both roles are explicitly selectable when an admin creates a user.
      setRoles(roleList);
      setOrgTree(Array.isArray(unitTree) ? unitTree : []);
    } catch (error) {
      setOptionsError(error.message || t('addUser.error'));
    } finally {
      setOptionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

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

  /**
   * Generate the username from the English name. The local slug appears
   * immediately and the debounced server call replaces it with the exact
   * unique value (with a numeric suffix on collision).
   */
  useEffect(() => {
    const name = formData.fullNameEn.trim();

    if (name.length < 1 || !ENGLISH_NAME_RE.test(name)) {
      // Invalidate any in-flight preview so it cannot repopulate a stale value.
      usernameRequest.current += 1;
      setUsernameState('idle');
      return undefined;
    }

    const requestId = usernameRequest.current + 1;
    usernameRequest.current = requestId;
    setUsernameState('checking');

    const timer = setTimeout(async () => {
      try {
        const username = await api.auth.previewUsername(name);
        if (usernameRequest.current !== requestId) return;
        setFormData((prev) =>
          prev.fullNameEn.trim() === name ? { ...prev, username } : prev
        );
        setUsernameState('ready');
        setErrors((prev) => {
          if (!prev.username) return prev;
          const next = { ...prev };
          delete next.username;
          return next;
        });
      } catch {
        if (usernameRequest.current !== requestId) return;
        // Keep the locally generated slug; the server allocates the final
        // value on submit, so this is only a preview failure.
        setUsernameState('idle');
      }
    }, USERNAME_CHECK_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [formData.fullNameEn]);

  const updateField = useCallback(
    (field) => (value) => {
      if (field === 'fullNameEn') {
        setFormData((prev) => ({
          ...prev,
          fullNameEn: value,
          username: previewUsernameLocally(value),
        }));
        clearError('fullNameEn');
        clearError('username');
        return;
      }

      if (field === 'extension') {
        value = String(value).replace(/[^0-9]/g, '').slice(0, 32);
      }

      if (AVAILABILITY_FIELDS.includes(field)) {
        // A change invalidates an in-flight availability check.
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
      if (validateField(field, formData, t)) return;

      const requestId = (availabilityRequest.current[field] || 0) + 1;
      availabilityRequest.current[field] = requestId;
      setCheckingFields((prev) => ({ ...prev, [field]: true }));

      try {
        const result = await api.auth.checkAvailability(field, value);
        if (availabilityRequest.current[field] !== requestId) return;
        if (!result.available) {
          setFieldError(
            field,
            field === 'email' ? t('addUser.emailTaken') : t('addUser.extensionTaken')
          );
        }
      } catch {
        // Non-blocking: the submit request performs the authoritative check.
      } finally {
        if (availabilityRequest.current[field] === requestId) {
          setCheckingFields((prev) => ({ ...prev, [field]: false }));
        }
      }
    },
    [formData, t, setFieldError]
  );

  const handleBlur = useCallback(
    (field) => {
      const message = validateField(field, formData, t);
      if (message) {
        setFieldError(field, message);
        return;
      }

      clearError(field);

      if (field === 'password' && formData.confirmPassword) {
        const confirmError = validateField('confirmPassword', formData, t);
        if (confirmError) setFieldError('confirmPassword', confirmError);
      }

      if (AVAILABILITY_FIELDS.includes(field)) {
        checkAvailability(field);
      }
    },
    [formData, t, clearError, setFieldError, checkAvailability]
  );

  const roleOptions = useMemo(
    () =>
      roles
        .filter((role) => ROLE_VALUES.includes(role.code))
        .map((role) => ({
          value: role.code,
          label: localizeText(role.name_ar || role.name_en || role.code),
        })),
    [roles]
  );

  // Resolve the selected unit's ancestor path in the fetched tree so the form
  // can display the exact hierarchical placement of the employee.
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

  // Index every unit with its depth and full path. The modal uses this both for
  // the expandable tree and for instant search across the entire hierarchy.
  const orgIndex = useMemo(() => {
    const entries = new Map();
    const arrow = isRTL ? '\u2190' : '\u2192';

    const visit = (nodes, depth, parentPath) => {
      const ids = [];
      for (const unit of nodes || []) {
        const name = localizeText(unit.nameAr || unit.nameEn || unit.code);
        const path = parentPath ? `${parentPath} ${arrow} ${name}` : name;
        const childIds = (unit.children || []).map((child) => child.id);

        entries.set(unit.id, {
          id: unit.id,
          name,
          path,
          depth,
          childIds,
          hasChildren: childIds.length > 0,
          searchText: [unit.nameAr, unit.nameEn, unit.code, name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        });
        ids.push(unit.id);
        visit(unit.children, depth + 1, path);
      }
      return ids;
    };

    return { entries, rootIds: visit(orgTree, 0, '') };
  }, [orgTree, isRTL, language]);

  // Without a query, walk only expanded branches. With a query, show every
  // matching unit in tree order, still indented by its original depth.
  const orgRows = useMemo(() => {
    const query = orgQuery.trim().toLowerCase();

    if (query) {
      return Array.from(orgIndex.entries.values()).filter((entry) =>
        entry.searchText.includes(query)
      );
    }

    const rows = [];
    const visit = (ids) => {
      for (const id of ids) {
        const entry = orgIndex.entries.get(id);
        if (!entry) continue;
        rows.push(entry);
        if (expandedOrgIds.has(id)) visit(entry.childIds);
      }
    };

    visit(orgIndex.rootIds);
    return rows;
  }, [orgIndex, expandedOrgIds, orgQuery]);

  const isSearchingOrg = orgQuery.trim().length > 0;

  const selectedOrgUnit = selectedOrgPath[selectedOrgPath.length - 1] || null;
  const selectedOrgUnitName = selectedOrgUnit
    ? localizeText(selectedOrgUnit.nameAr || selectedOrgUnit.nameEn || selectedOrgUnit.code)
    : '';

  const selectedOrgPathLabel = useMemo(() => {
    const arrow = isRTL ? '\u2190' : '\u2192';
    return selectedOrgPath
      .map((unit) => localizeText(unit.nameAr || unit.nameEn || unit.code))
      .join(` ${arrow} `);
  }, [selectedOrgPath, isRTL, language]);

  const openOrgPicker = () => {
    setOrgQuery('');
    setExpandedOrgIds(() => {
      const next = new Set();
      if (selectedOrgPath.length > 0) {
        selectedOrgPath.forEach((unit) => next.add(unit.id));
      } else {
        orgIndex.rootIds.forEach((id) => next.add(id));
      }
      return next;
    });
    setOrgModalVisible(true);
  };

  const closeOrgPicker = () => {
    setOrgModalVisible(false);
    setOrgQuery('');
  };

  const toggleOrgUnit = (unitId) => {
    setExpandedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const selectOrgUnit = (unitId) => {
    setFormData((prev) => ({ ...prev, orgUnitId: unitId }));
    clearError('orgUnitId');
    clearError('general');
    closeOrgPicker();
  };

  /**
   * Scroll the first errored field near the top of the viewport. Uses window
   * coordinates so it works regardless of section nesting.
   */
  const scrollToFirstError = (errorMap) => {
    const first = FIELD_ORDER.find((field) => errorMap[field]);
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
      setErrors({ general: t('addUser.error') });
      return;
    }

    const byCode = {
      EMAIL_TAKEN: { field: 'email', message: t('addUser.emailTaken') },
      EXTENSION_TAKEN: { field: 'extension', message: t('addUser.extensionTaken') },
      USERNAME_TAKEN: { field: 'username', message: t('addUser.usernameTaken') },
      EMPLOYEE_CODE_TAKEN: { field: 'username', message: t('addUser.usernameTaken') },
    };

    // Prefer localized messages for the known uniqueness codes.
    if (error.code && byCode[error.code]) {
      const { field, message } = byCode[error.code];
      const next = { [field]: message };
      setErrors(next);
      scrollToFirstError(next);
      return;
    }

    const fieldErrors = {};
    if (Array.isArray(error.details)) {
      for (const detail of error.details) {
        if (!detail || !detail.field || !FIELD_ORDER.includes(detail.field)) continue;
        if (!fieldErrors[detail.field]) fieldErrors[detail.field] = detail.message;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      scrollToFirstError(fieldErrors);
      return;
    }

    if (error.status === 403) {
      setErrors({ general: t('addUser.forbidden') });
      return;
    }

    setErrors({ general: error.message || t('addUser.error') });
  };

  const handleSubmit = async () => {
    if (loading) return;

    const nextErrors = validateEmployeeForm(formData, t);

    if (usernameState === 'checking' && !nextErrors.username) {
      setErrors({ general: t('addUser.usernameChecking') });
      return;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      scrollToFirstError(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const created = await createUser({
        // Send the confirmed preview only; otherwise let the server allocate
        // the authoritative unique value from the English name.
        username: usernameState === 'ready' ? formData.username.trim() : undefined,
        password: formData.password,
        fullNameAr: formData.fullNameAr.trim(),
        fullNameEn: formData.fullNameEn.trim(),
        email: formData.email.trim(),
        jobTitleAr: formData.jobTitleAr.trim(),
        extension: formData.extension.trim(),
        roleCode: formData.roleCode,
        orgUnitId: formData.orgUnitId,
      });
      setSavedUsername(created?.username || formData.username.trim());
    } catch (error) {
      applyServerError(error);
    } finally {
      setLoading(false);
    }
  };

  const usernameHint =
    usernameState === 'checking'
      ? t('addUser.usernameChecking')
      : usernameState === 'ready'
        ? t('addUser.usernameAuto')
        : t('addUser.usernameHint');

  const renderSuccess = () => (
    <View style={styles.successCard}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={48} color={colors.success} />
      </View>
      <Text style={styles.successTitle}>{t('addUser.success')}</Text>
      <View style={styles.successRow}>
        <Text style={styles.successLabel}>{t('addUser.username')}</Text>
        <Text style={styles.successValue}>{savedUsername}</Text>
      </View>
      <CustomButton
        title={t('common.close')}
        onPress={() => navigation.goBack()}
        variant="primary"
        style={styles.successButton}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
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
            {savedUsername ? (
              renderSuccess()
            ) : (
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
                      required
                      disabled
                      error={errors.username}
                      hint={usernameHint}
                      icon="at"
                    />
                  </View>

                  <View ref={fieldRef('password')} collapsable={false}>
                    <CustomInput
                      label={t('addUser.password')}
                      value={formData.password}
                      onChangeText={updateField('password')}
                      onBlur={() => handleBlur('password')}
                      placeholder={t('addUser.passwordPlaceholder')}
                      secureTextEntry
                      maxLength={200}
                      required
                      error={errors.password}
                      hint={t('addUser.passwordHint')}
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
                      required
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
                      hint={checkingFields.email ? t('addUser.availabilityChecking') : undefined}
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
                        checkingFields.extension ? t('addUser.availabilityChecking') : undefined
                      }
                      icon="call"
                    />
                  </View>

                  {optionsLoading ? (
                    <View style={styles.optionsLoading}>
                      <ActivityIndicator size="small" color={colors.primaryLight} />
                      <Text style={styles.optionsLoadingText}>{t('addUser.loadingOptions')}</Text>
                    </View>
                  ) : (
                    <>
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
                          onPress={openOrgPicker}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: orgModalVisible }}
                          style={[
                            styles.orgUnitTrigger,
                            errors.orgUnitId && styles.orgUnitTriggerError,
                          ]}
                        >
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
                    </>
                  )}
                </View>

                <CustomButton
                  title={t('addUser.submit')}
                  onPress={handleSubmit}
                  loading={loading}
                  disabled={optionsLoading || !!optionsError || loading}
                  icon="person-add"
                  style={styles.submitButton}
                  iconPosition="left"
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={orgModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOrgPicker}
        statusBarTranslucent
      >
        <View style={[styles.orgModalBackdrop, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeOrgPicker}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.orgSheetWrapper,
              { maxHeight: Math.round(height * 0.88) },
            ]}
          >
            <SafeAreaView style={styles.orgSheet} edges={['bottom']}>
              <View style={styles.orgSheetHandle} />

              <View style={styles.orgSheetHeader}>
                <Text style={styles.orgSheetTitle}>{t('addUser.orgUnit')}</Text>
                <Pressable
                  onPress={closeOrgPicker}
                  hitSlop={10}
                  style={styles.orgSheetClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <CustomInput
                value={orgQuery}
                onChangeText={setOrgQuery}
                placeholder={t('common.search')}
                icon="search"
                style={styles.orgSearch}
              />

              <ScrollView
                style={[
                  styles.orgTreeScroll,
                  { maxHeight: Math.max(160, Math.round(height * 0.55)) },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {orgRows.length === 0 ? (
                  <Text style={[styles.orgEmpty, { textAlign: align }]}>
                    {t('org.noOptions')}
                  </Text>
                ) : (
                  orgRows.map((row) => {
                    const isSelected = row.id === formData.orgUnitId;
                    const isExpanded = expandedOrgIds.has(row.id);
                    const toggleIcon = isExpanded
                      ? 'chevron-down'
                      : isRTL
                        ? 'chevron-back'
                        : 'chevron-forward';

                    return (
                      <View
                        key={row.id}
                        style={[
                          styles.orgRow,
                          { paddingStart: spacing.sm + row.depth * spacing.md },
                          isSelected && styles.orgRowSelected,
                        ]}
                      >
                        {row.hasChildren && !isSearchingOrg ? (
                          <Pressable
                            onPress={() => toggleOrgUnit(row.id)}
                            hitSlop={8}
                            style={styles.orgRowToggle}
                            accessibilityRole="button"
                            accessibilityLabel={row.name}
                            accessibilityState={{ expanded: isExpanded }}
                          >
                            <Ionicons
                              name={toggleIcon}
                              size={16}
                              color={colors.textSecondary}
                            />
                          </Pressable>
                        ) : (
                          <View style={styles.orgRowToggleSpacer} />
                        )}

                        <Pressable
                          onPress={() => selectOrgUnit(row.id)}
                          style={styles.orgRowBody}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.orgRowName,
                              { textAlign: align },
                              isSelected && styles.orgRowNameSelected,
                            ]}
                          >
                            {row.name}
                          </Text>
                          {row.depth > 0 && (
                            <Text
                              numberOfLines={1}
                              style={[styles.orgRowPath, { textAlign: align }]}
                            >
                              {row.path}
                            </Text>
                          )}
                        </Pressable>

                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={colors.primaryLight}
                          />
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    color: colors.dangerStrong,
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
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  successIcon: {
    marginBottom: spacing.sm,
  },
  successTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  successLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  successValue: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  successButton: {
    alignSelf: 'stretch',
  },
  orgModalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  orgSheetWrapper: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  orgSheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    ...shadows.lg,
  },
  orgSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderDark,
    marginBottom: spacing.sm,
  },
  orgSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  orgSheetTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
  },
  orgSheetClose: {
    padding: spacing.xs,
  },
  orgSearch: {
    marginBottom: spacing.sm,
  },
  orgTreeScroll: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingEnd: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  orgRowSelected: {
    backgroundColor: '#f5f9fc',
  },
  orgRowToggle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgRowToggleSpacer: {
    width: 24,
    height: 24,
  },
  orgRowBody: {
    flex: 1,
    marginStart: spacing.xs,
  },
  orgRowName: {
    ...typography.bodySmall,
    color: colors.text,
  },
  orgRowNameSelected: {
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
  orgRowPath: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  orgEmpty: {
    ...typography.bodySmall,
    color: colors.textLight,
    paddingVertical: spacing.xl,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});

export default AddUserScreen;
