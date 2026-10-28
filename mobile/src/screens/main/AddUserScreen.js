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

const USERNAME_RE = /^[a-zA-Z0-9._]+$/;

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

  const [roles, setRoles] = useState([]);
  const [orgTree, setOrgTree] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [orgModalVisible, setOrgModalVisible] = useState(false);
  const [orgQuery, setOrgQuery] = useState('');
  const [expandedOrgIds, setExpandedOrgIds] = useState(() => new Set());

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

  const update = (field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const roleOptions = useMemo(
    () =>
      roles.map((role) => ({
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
    setErrors((prev) => {
      if (!prev.orgUnitId) return prev;
      const next = { ...prev };
      delete next.orgUnitId;
      return next;
    });
    closeOrgPicker();
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
                    <SelectField
                      label={t('addUser.role')}
                      value={formData.roleCode}
                      options={roleOptions}
                      onSelect={update('roleCode')}
                      placeholder={t('addUser.rolePlaceholder')}
                      required
                      error={errors.roleCode}
                      emptyText={t('org.noOptions')}
                    />

                    <View style={styles.orgUnitField}>
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
                disabled={optionsLoading || !!optionsError}
                icon="person-add"
                style={styles.submitButton}
                iconPosition="left"
              />
            </View>
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

  orgUnitField: {
    marginBottom: spacing.md,
  },
  orgUnitLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  orgUnitRequired: {
    color: colors.danger,
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
    borderColor: colors.danger,
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
    color: colors.danger,
    marginTop: spacing.xs,
  },
  orgUnitHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
