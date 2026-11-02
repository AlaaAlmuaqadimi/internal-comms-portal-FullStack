import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import SearchBar from '../../components/SearchBar';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import UserAvatar from '../../components/UserAvatar';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import Modal from '../../components/Modal';
import EditEmployeeModal from './EditEmployeeModal';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';
import usePresence from '../../hooks/usePresence';
import { flipStyles } from '../../i18n/rtlStyles';
import { hasRole } from '../../utils/permissions';

const DirectoryScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const isAdmin = hasRole(user, 'admin');

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [orgTree, setOrgTree] = useState([]);

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [toast, setToast] = useState('');

  const debouncedSearch = useDebounce(searchQuery, 350);
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const loadEmployees = useCallback(
    async (overrides = {}) => {
      const q = overrides.q ?? debouncedSearch;
      const roleCode = overrides.roleCode ?? roleFilter;
      const department = overrides.departmentId ?? departmentId;
      const unit = overrides.unitId ?? unitId;
      // A unit always lives inside the selected department, so the unit id
      // alone narrows the SQL query enough. The department dropdown only scopes
      // which units are offered.
      const orgUnitId = overrides.orgUnitId ?? (unit || department);
      const status = overrides.status ?? statusFilter;

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      if (!hasLoadedRef.current) setLoading(true);
      else setFetching(true);

      try {
        const list = await api.employees.list({
          q: q.trim(),
          roleCode,
          orgUnitId,
          status,
        });
        if (requestRef.current !== requestId) return;
        setEmployees(Array.isArray(list) ? list : []);
        setError(null);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setEmployees([]);
        setError(err.message || t('directory.fetchError'));
      } finally {
        if (requestRef.current === requestId) {
          hasLoadedRef.current = true;
          setLoading(false);
          setFetching(false);
        }
      }
    },
    [debouncedSearch, roleFilter, departmentId, unitId, statusFilter, t]
  );

  // Re-query whenever the debounced search or a filter changes.
  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Org units power the filter dropdown and the edit form. A failure here only
  // disables those controls; the directory itself still works.
  useEffect(() => {
    let active = true;
    api.org
      .getTree()
      .then((tree) => {
        if (active) setOrgTree(Array.isArray(tree) ? tree : []);
      })
      .catch(() => {
        if (active) setOrgTree([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEmployees();
    setRefreshing(false);
  }, [loadEmployees]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setRoleFilter('');
    setDepartmentId('');
    setUnitId('');
    setStatusFilter('');
    // Run the unfiltered query immediately instead of waiting for the search
    // debounce, so the reset feels instantaneous.
    loadEmployees({
      q: '',
      roleCode: '',
      departmentId: '',
      unitId: '',
      orgUnitId: '',
      status: '',
    });
  }, [loadEmployees]);

  const handleDepartmentChange = useCallback((value) => {
    setDepartmentId(value);
    // Units are scoped to the selected department, so clear a stale unit.
    setUnitId('');
  }, []);

  // Live online/offline indicators. The server presence seeds the map; while no
  // status filter is active the hook keeps a simulated heartbeat running.
  const { isOnline } = usePresence(employees, { simulate: !statusFilter });

  const handleContactPress = (employee) => {
    setSelectedEmployee(employee);
    setModalVisible(true);
  };

  const handleCall = () => {
    setModalVisible(false);
    if (!selectedEmployee) return;
    navigation.navigate('CallActive', {
      contact: {
        ...selectedEmployee,
        name: selectedEmployee.fullNameAr,
        unitName: selectedEmployee.orgUnitNameAr,
        isKitchen: false,
      },
    });
  };

  const openEdit = (employee) => {
    if (!isAdmin) return;
    setEditingEmployee(employee);
    setEditVisible(true);
  };

  const handleEditSaved = useCallback(async () => {
    setEditVisible(false);
    setEditingEmployee(null);
    showToast(t('editEmployee.saveSuccess'));
    await loadEmployees();
  }, [loadEmployees, showToast, t]);

  const roleFilterOptions = useMemo(
    () => [
      { value: '', label: t('directory.allRoles') },
      { value: 'admin', label: t('directory.admin') },
      { value: 'employee', label: t('directory.employee') },
    ],
    [t]
  );

  const departmentOptions = useMemo(() => {
    const options = [{ value: '', label: t('directory.allDepartments') }];
    const arrow = isRTL ? '\u2190' : '\u2192';

    const visit = (nodes, parentKind, parentPath) => {
      for (const unit of nodes || []) {
        const name = localizeText(unit.nameAr || unit.nameEn || unit.code);
        const path = parentPath ? `${parentPath} ${arrow} ${name}` : name;
        const isAdministration =
          ['directorate', 'office', 'deputy'].includes(unit.kind) &&
          ['root', 'deputy', 'group'].includes(parentKind);

        if (isAdministration) {
          options.push({
            value: unit.id,
            label: name,
            description: parentPath || undefined,
          });
        }

        visit(unit.children, unit.kind, path);
      }
    };

    visit(orgTree, 'root', '');
    return options;
  }, [orgTree, isRTL, language, t]);

  const unitOptions = useMemo(() => {
    const options = [{ value: '', label: t('directory.allUnits') }];
    const arrow = isRTL ? '\u2190' : '\u2192';

    const findUnit = (nodes) => {
      for (const unit of nodes || []) {
        if (unit.id === departmentId) return unit;
        const match = findUnit(unit.children);
        if (match) return match;
      }
      return null;
    };

    // With a department selected the unit list is scoped to its descendants;
    // otherwise every section in the tree is offered.
    const roots = departmentId ? findUnit(orgTree)?.children || [] : orgTree;

    const visit = (nodes, parentPath) => {
      for (const unit of nodes || []) {
        const name = localizeText(unit.nameAr || unit.nameEn || unit.code);
        if (unit.kind === 'section') {
          options.push({
            value: unit.id,
            label: name,
            description: parentPath || undefined,
          });
        }
        visit(unit.children, parentPath ? `${parentPath} ${arrow} ${name}` : name);
      }
    };

    visit(roots, '');
    return options;
  }, [orgTree, departmentId, isRTL, language, t]);

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('directory.allStatuses') },
      { value: 'active', label: t('directory.statusActive') },
      { value: 'inactive', label: t('directory.statusInactive') },
      { value: 'online', label: t('directory.statusOnline') },
      { value: 'offline', label: t('directory.statusOffline') },
    ],
    [t]
  );

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'small' : isLargeScreen ? 'large' : 'medium';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const notAvailable = t('directory.notAvailable');

  const renderEmployee = ({ item }) => {
    const online = isOnline(item);
    const accountActive = item.isActive !== false;
    // Employees attached to a section show both the parent administration and
    // the section; employees attached directly to an administration show only
    // that administration.
    const isSection = item.orgUnitKind === 'section';
    const departmentName =
      (isSection ? item.parentUnitNameAr : item.orgUnitNameAr) ||
      item.parentUnitNameAr ||
      item.orgUnitNameAr ||
      notAvailable;
    const showUnit = isSection && !!item.orgUnitNameAr;

    return (
      <View style={[styles.employeeCard, { padding: cardPadding }]}>
        <View style={styles.employeeHeader}>
          <UserAvatar
            person={{ name: item.fullNameAr, avatar: item.avatarUrl }}
            size={avatarSize}
          />

          <View style={styles.employeeInfo}>
            <Text
              style={[styles.employeeName, isSmallScreen && styles.employeeNameSmall]}
              numberOfLines={2}
            >
              {item.fullNameAr}
            </Text>

            {item.fullNameEn ? (
              <Text style={styles.employeeEnglishName} numberOfLines={1}>
                {item.fullNameEn}
              </Text>
            ) : null}

            <Text
              style={[styles.employeeUnit, isSmallScreen && styles.employeeUnitSmall]}
              numberOfLines={1}
            >
              {item.jobTitleAr || notAvailable}
            </Text>

            <View style={styles.presenceRow}>
              <View
                style={[
                  styles.presenceBadge,
                  online ? styles.presenceBadgeOnline : styles.presenceBadgeOffline,
                ]}
              >
                <View
                  style={[
                    styles.presenceDotHalo,
                    online ? styles.presenceDotHaloOnline : styles.presenceDotHaloOffline,
                  ]}
                >
                  <View
                    style={[
                      styles.presenceDot,
                      online ? styles.presenceDotOnline : styles.presenceDotOffline,
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.presenceText,
                    online ? styles.presenceTextOnline : styles.presenceTextOffline,
                  ]}
                >
                  {online ? t('directory.statusOnline') : t('directory.statusOffline')}
                </Text>
              </View>
            </View>
          </View>

          {isAdmin ? (
            <Pressable
              onPress={() => openEdit(item)}
              style={styles.editButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('directory.editEmployee')}
            >
              <Ionicons name="create-outline" size={20} color={colors.primaryLight} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.orgBlock}>
          <View style={styles.orgRow}>
            <View style={styles.orgIcon}>
              <Ionicons name="business" size={15} color={colors.primaryLight} />
            </View>
            <View style={styles.orgTextWrap}>
              <Text style={styles.orgLabel}>{t('directory.managementLabel')}</Text>
              <Text style={styles.orgValue} numberOfLines={2}>
                {departmentName}
              </Text>
            </View>
          </View>

          {showUnit ? (
            <View style={styles.orgRow}>
              <View style={styles.orgIcon}>
                <Ionicons name="git-branch" size={15} color={colors.primaryLight} />
              </View>
              <View style={styles.orgTextWrap}>
                <Text style={styles.orgLabel}>{t('directory.unitLabel')}</Text>
                <Text style={styles.orgValue} numberOfLines={2}>
                  {item.orgUnitNameAr}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="call-outline" size={14} color={colors.textLight} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.extension || notAvailable}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="mail-outline" size={14} color={colors.textLight} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.email || notAvailable}
            </Text>
          </View>
        </View>

        {item.username ? (
          <Text style={styles.usernameText} numberOfLines={1}>
            @{item.username}
          </Text>
        ) : null}

        <View style={styles.employeeActions}>
          <View style={styles.employeeBadges}>
            <View
              style={[
                styles.roleBadge,
                item.roleCode === 'admin' && styles.roleBadgeAdmin,
              ]}
            >
              <Text
                style={[
                  styles.roleBadgeText,
                  item.roleCode === 'admin' && styles.roleBadgeTextAdmin,
                ]}
              >
                {item.roleCode === 'admin'
                  ? t('directory.admin')
                  : t('directory.employee')}
              </Text>
            </View>

            <View
              style={[
                styles.accountBadge,
                accountActive ? styles.accountBadgeActive : styles.accountBadgeInactive,
              ]}
            >
              <Ionicons
                name={accountActive ? 'checkmark-circle' : 'pause-circle'}
                size={12}
                color={accountActive ? colors.success : colors.danger}
              />
              <Text
                style={[
                  styles.accountBadgeText,
                  accountActive
                    ? styles.accountBadgeTextActive
                    : styles.accountBadgeTextInactive,
                ]}
              >
                {accountActive
                  ? t('directory.activeAccount')
                  : t('directory.inactiveAccount')}
              </Text>
            </View>
          </View>

          <CustomButton
            title={t('directory.callButton')}
            onPress={() => handleContactPress(item)}
            icon="call"
            size="small"
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return <Loading fullScreen text={t('directory.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={[styles.header, { padding: headerPadding }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
                {t('directory.title')}
              </Text>
              <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
                {t('directory.subtitle')}
              </Text>
            </View>
          </View>
          {isAdmin && (
            <Pressable
              onPress={() => navigation.navigate('AddUser')}
              style={[styles.addButton, { alignSelf: isRTL ? 'flex-start' : 'flex-end' }]}
            >
              <Ionicons name="person-add" size={isSmallScreen ? 16 : 20} color={colors.textWhite} />
              <Text style={[styles.addButtonText, isSmallScreen && styles.addButtonTextSmall]}>
                {t('addUser.entry')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={[styles.filtersContainer, { padding: headerPadding }]}>
        <View style={styles.searchRow}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('directory.searchPlaceholder')}
            onClear={() => setSearchQuery('')}
            style={styles.searchBar}
          />
          <Pressable
            onPress={resetFilters}
            style={styles.resetIconButton}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('directory.resetFilters')}
          >
            <Ionicons name="refresh" size={20} color={colors.primaryLight} />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <SelectField
            label={t('directory.departmentFilter')}
            value={departmentId}
            options={departmentOptions}
            onSelect={handleDepartmentChange}
            placeholder={t('directory.allDepartments')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={240}
            emptyText={t('org.noOptions')}
          />
          <SelectField
            label={t('directory.unitFilter')}
            value={unitId}
            options={unitOptions}
            onSelect={setUnitId}
            placeholder={t('directory.allUnits')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={220}
            emptyText={t('org.noOptions')}
          />
          <SelectField
            label={t('directory.statusFilter')}
            value={statusFilter}
            options={statusOptions}
            onSelect={setStatusFilter}
            placeholder={t('directory.allStatuses')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={220}
          />
          <SelectField
            label={t('directory.roleFilter')}
            value={roleFilter}
            options={roleFilterOptions}
            onSelect={setRoleFilter}
            placeholder={t('directory.allRoles')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={180}
          />
        </View>

        <View style={styles.filterFooter}>
          <Pressable onPress={resetFilters} style={styles.resetButton}>
            <Ionicons name="refresh-outline" size={14} color={colors.primaryLight} />
            <Text style={[styles.resetButtonText, isSmallScreen && styles.resetButtonTextSmall]}>
              {t('directory.resetFilters')}
            </Text>
          </Pressable>
          <View style={styles.resultsWrap}>
            {fetching ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : null}
            <Text style={[styles.resultsCount, isSmallScreen && styles.resultsCountSmall]}>
              {t('directory.resultsCount', { count: employees.length })}
            </Text>
          </View>
        </View>
      </View>

      {/* قائمة الموظفين */}
      {error ? (
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.errorStateText}>{error}</Text>
          <CustomButton
            title={t('common.retry')}
            onPress={() => loadEmployees()}
            variant="outline"
            size="small"
          />
        </View>
      ) : employees.length === 0 ? (
        <EmptyState
          icon="search"
          title={t('directory.noResultsTitle')}
          description={t('directory.noResultsDescription')}
          actionTitle={t('directory.resetSearch')}
          onAction={resetFilters}
        />
      ) : (
        <FlatList
          data={employees}
          renderItem={renderEmployee}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            isLandscape && styles.listContentLandscape,
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      {/* نافذة خيارات التواصل */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('directory.contactOptions')}
        size="small"
      >
        {selectedEmployee && (
          <View style={styles.modalContent}>
            <Text style={styles.modalName}>{selectedEmployee.fullNameAr}</Text>
            <Text style={styles.modalDescription}>
              {t('directory.contactDescription')}
            </Text>
            <View style={styles.modalActions}>
              <CustomButton
                title={t('directory.startCall')}
                onPress={handleCall}
                icon="call"
                style={styles.modalButton}
              />
              <CustomButton
                title={t('directory.sendMessage')}
                onPress={() => setModalVisible(false)}
                variant="outline"
                icon="mail"
                style={styles.modalButton}
              />
            </View>
          </View>
        )}
      </Modal>

      <EditEmployeeModal
        visible={editVisible}
        employee={editingEmployee}
        orgTree={orgTree}
        onClose={() => {
          setEditVisible(false);
          setEditingEmployee(null);
        }}
        onSaved={handleEditSaved}
      />

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={20} color={colors.textWhite} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const rawStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'column',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    width: '100%',
  },
  titleBorder: {
    width: 4,
    height: 50,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  titleSmall: {
    fontSize: 18,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  subtitleSmall: {
    fontSize: 11,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    ...typography.buttonSmall,
    color: colors.textWhite,
  },
  addButtonTextSmall: {
    fontSize: 11,
  },
  filtersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
  },
  resetIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surface,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  filterField: {
    flex: 1,
    minWidth: 140,
    marginBottom: 0,
  },
  filterFieldSmall: {
    minWidth: '100%',
  },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  resetButtonText: {
    ...typography.buttonSmall,
    color: colors.primaryLight,
  },
  resetButtonTextSmall: {
    fontSize: 11,
  },
  resultsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resultsCount: {
    ...typography.bodyBold,
    color: colors.text,
  },
  resultsCountSmall: {
    fontSize: 12,
  },
  listContent: {
    padding: spacing.md,
  },
  listContentLandscape: {
    paddingHorizontal: '15%',
  },
  employeeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  employeeInfo: {
    flex: 1,
    paddingTop: 2,
  },
  employeeName: {
    ...typography.h4,
    color: colors.text,
    fontFamily: 'Cairo_700Bold',
  },
  employeeNameSmall: {
    fontSize: 14,
  },
  employeeEnglishName: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  employeeUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  employeeUnitSmall: {
    fontSize: 11,
  },
  presenceRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  presenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  presenceBadgeOnline: {
    backgroundColor: colors.successLight,
  },
  presenceBadgeOffline: {
    backgroundColor: colors.background,
  },
  presenceDotHalo: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDotHaloOnline: {
    backgroundColor: '#cfe9dd',
  },
  presenceDotHaloOffline: {
    backgroundColor: '#e2e8ee',
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presenceDotOnline: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 4,
  },
  presenceDotOffline: {
    backgroundColor: colors.textLight,
  },
  presenceText: {
    ...typography.captionBold,
  },
  presenceTextOnline: {
    color: colors.success,
  },
  presenceTextOffline: {
    color: colors.textSecondary,
  },
  editButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surface,
  },
  orgBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orgIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    backgroundColor: '#eef4fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgTextWrap: {
    flex: 1,
  },
  orgLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  orgValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontFamily: 'Cairo_700Bold',
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
  },
  metaText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  usernameText: {
    ...typography.caption,
    color: colors.textLight,
    marginBottom: spacing.sm,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  accountBadgeActive: {
    backgroundColor: colors.successLight,
    borderColor: '#bfe0d3',
  },
  accountBadgeInactive: {
    backgroundColor: colors.dangerLight,
    borderColor: '#f0c4c4',
  },
  accountBadgeText: {
    ...typography.captionBold,
  },
  accountBadgeTextActive: {
    color: colors.success,
  },
  accountBadgeTextInactive: {
    color: colors.danger,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  employeeBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flex: 1,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  roleBadgeAdmin: {
    backgroundColor: colors.warningLight,
    borderColor: colors.accent,
  },
  roleBadgeText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  roleBadgeTextAdmin: {
    color: colors.warning,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  errorStateText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  modalContent: {
    alignItems: 'center',
  },
  modalName: {
    ...typography.h4,
    color: colors.primaryLight,
    marginBottom: spacing.sm,
  },
  modalDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  modalButton: {
    flex: 1,
  },
  toast: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.md,
    zIndex: 100,
    elevation: 100,
  },
  toastText: {
    ...typography.bodyBold,
    color: colors.textWhite,
    flexShrink: 1,
  },
});

export default DirectoryScreen;
