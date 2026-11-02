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
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import EditEmployeeModal from './EditEmployeeModal';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';
import { flipStyles } from '../../i18n/rtlStyles';
import { hasRole } from '../../utils/permissions';

const DirectoryScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isWideScreen = width >= 700;
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

  // One button clears every filter and immediately reloads the full dataset,
  // instead of waiting for the search debounce to settle.
  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setRoleFilter('');
    setDepartmentId('');
    setUnitId('');
    setStatusFilter('');
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

  const handleCallPress = useCallback(
    (employee) => {
      if (!employee) return;
      navigation.navigate('CallActive', {
        contact: {
          ...employee,
          name: employee.fullNameAr,
          unitName: employee.orgUnitNameAr,
          avatar: employee.avatarUrl,
          extension: employee.extension,
          phoneNumber: employee.extension,
          isKitchen: false,
        },
      });
    },
    [navigation]
  );

  const openEdit = useCallback(
    (employee) => {
      if (!isAdmin) return;
      setEditingEmployee(employee);
      setEditVisible(true);
    },
    [isAdmin]
  );

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
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const notAvailable = t('directory.notAvailable');

  const renderEmployee = ({ item }) => {
    // Employees attached to a section show both the parent administration and
    // the section; employees attached directly to an administration show only
    // that administration.
    const isSection = item.orgUnitKind === 'section';
    const departmentName =
      (isSection ? item.parentUnitNameAr : item.orgUnitNameAr) ||
      item.parentUnitNameAr ||
      item.orgUnitNameAr ||
      notAvailable;
    const unitName =
      isSection && item.orgUnitNameAr && item.orgUnitNameAr !== departmentName
        ? item.orgUnitNameAr
        : '';

    return (
      <View style={[styles.employeeCard, { padding: cardPadding }]}>
        <View style={styles.employeeInfo}>
          <Text
            style={[styles.employeeName, isSmallScreen && styles.employeeNameSmall]}
            numberOfLines={2}
          >
            {item.fullNameAr}
          </Text>

          <Text style={styles.employeeOrg} numberOfLines={2}>
            {unitName ? `${departmentName} \u00b7 ${unitName}` : departmentName}
          </Text>
        </View>

        <View style={styles.cardActions}>
          <Pressable
            onPress={() => handleCallPress(item)}
            style={({ pressed }) => [
              styles.iconButton,
              styles.callButton,
              pressed && styles.iconButtonPressed,
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('directory.callButton')}
          >
            <Ionicons name="call" size={18} color={colors.textWhite} />
          </Pressable>

          {isAdmin ? (
            <Pressable
              onPress={() => openEdit(item)}
              style={({ pressed }) => [
                styles.iconButton,
                styles.editButton,
                pressed && styles.iconButtonPressed,
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('directory.editEmployee')}
            >
              <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
            </Pressable>
          ) : null}
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

      {/* البحث والتصفية — بلا عناوين، صف واحد مرن */}
      <View style={[styles.filtersContainer, { padding: headerPadding }]}>
        <View style={styles.filterGrid}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('directory.searchPlaceholder')}
            onClear={() => setSearchQuery('')}
            style={[styles.searchBar, isWideScreen && styles.searchBarWide]}
          />

          <Pressable
            onPress={resetFilters}
            style={({ pressed }) => [
              styles.resetIconButton,
              pressed && styles.resetIconButtonPressed,
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('directory.resetFilters')}
          >
            <Ionicons name="refresh" size={20} color={colors.textWhite} />
          </Pressable>

          <SelectField
            value={departmentId}
            options={departmentOptions}
            onSelect={handleDepartmentChange}
            placeholder={t('directory.allDepartments')}
            compact
            style={[styles.filterField, isWideScreen && styles.filterFieldWide]}
            maxListHeight={240}
            emptyText={t('org.noOptions')}
          />
          <SelectField
            value={unitId}
            options={unitOptions}
            onSelect={setUnitId}
            placeholder={t('directory.allUnits')}
            compact
            style={[styles.filterField, isWideScreen && styles.filterFieldWide]}
            maxListHeight={220}
            emptyText={t('org.noOptions')}
          />
          <SelectField
            value={statusFilter}
            options={statusOptions}
            onSelect={setStatusFilter}
            placeholder={t('directory.allStatuses')}
            compact
            style={[styles.filterField, isWideScreen && styles.filterFieldWide]}
            maxListHeight={220}
          />
          <SelectField
            value={roleFilter}
            options={roleFilterOptions}
            onSelect={setRoleFilter}
            placeholder={t('directory.allRoles')}
            compact
            style={[styles.filterField, isWideScreen && styles.filterFieldWide]}
            maxListHeight={180}
          />
        </View>

        <View style={styles.filterFooter}>
          {fetching ? (
            <ActivityIndicator size="small" color={colors.primaryLight} />
          ) : null}
          <Text style={[styles.resultsCount, isSmallScreen && styles.resultsCountSmall]}>
            {t('directory.resultsCount', { count: employees.length })}
          </Text>
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
  // Compact, label-free filter row. Items wrap into a tidy grid on phones and
  // sit on a single line on tablets; flexDirection is mirrored for RTL.
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  searchBar: {
    flexGrow: 2,
    flexBasis: 200,
    minHeight: 44,
  },
  searchBarWide: {
    flexBasis: 220,
  },
  resetIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    ...shadows.sm,
  },
  resetIconButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  filterField: {
    flexGrow: 1,
    flexBasis: 140,
    marginBottom: 0,
    minWidth: 130,
  },
  filterFieldWide: {
    flexBasis: 150,
  },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    ...typography.h4,
    color: colors.text,
    fontFamily: 'Cairo_700Bold',
  },
  employeeNameSmall: {
    fontSize: 14,
  },
  employeeOrg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  callButton: {
    backgroundColor: colors.primaryLight,
  },
  editButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  iconButtonPressed: {
    opacity: 0.8,
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
