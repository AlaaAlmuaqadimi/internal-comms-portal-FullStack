import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/AppText';
import SafeAreaView from '../../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import SearchBar from '../../components/SearchBar';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import UserAvatar from '../../components/UserAvatar';
import EditEmployeeModal from './EditEmployeeModal';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView, ScaleInView } from '../../components/Motion';
import { listItemDelay } from '../../constants/motion';
import { hasRole } from '../../utils/permissions';
import { useStartCall } from '../../context/CallContext';

const DirectoryScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const isAdmin = hasRole(user, 'admin');

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Only the filters people actually use: who (search), where (department,
  // which includes its offices and sections) and who is reachable now.
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

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
      // The server matches the whole subtree of the selected department.
      const orgUnitId = overrides.departmentId ?? departmentId;
      const status = (overrides.onlineOnly ?? onlineOnly) ? 'online' : '';

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      if (!hasLoadedRef.current) setLoading(true);
      else setFetching(true);

      try {
        const list = await api.employees.list({ q: q.trim(), orgUnitId, status });
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
    [debouncedSearch, departmentId, onlineOnly, t]
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
    setDepartmentId('');
    setOnlineOnly(false);
    loadEmployees({ q: '', departmentId: '', onlineOnly: false });
  }, [loadEmployees]);

  const startCall = useStartCall();
  const handleCallPress = useCallback(
    (employee) => {
      if (!employee) return;
      startCall(employee.id);
    },
    [startCall]
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

  // أحجام متجاوبة
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const notAvailable = t('directory.notAvailable');

  const renderEmployee = ({ item, index }) => {
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
      <FadeInView delay={listItemDelay(index)} style={styles.employeeRow}>
        <UserAvatar person={{ name: item.fullNameAr, avatarUrl: item.avatarUrl }} size="medium" />
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName} numberOfLines={1}>
            {item.fullNameAr}
          </Text>
          <Text style={styles.employeeOrg} numberOfLines={1}>
            {unitName ? `${departmentName} \u00b7 ${unitName}` : departmentName}
          </Text>
        </View>

        <View style={styles.rowActions}>
          {isAdmin ? (
            <Pressable
              onPress={() => openEdit(item)}
              style={({ pressed }) => [
                styles.roundButton,
                styles.editButton,
                pressed && styles.roundButtonPressed,
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('directory.editEmployee')}
            >
              <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => handleCallPress(item)}
            style={({ pressed }) => [
              styles.roundButton,
              styles.callButton,
              pressed && styles.roundButtonPressed,
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('directory.callButton')}
          >
            <Ionicons name="call" size={18} color={colors.primaryLight} />
          </Pressable>
        </View>
      </FadeInView>
    );
  };

  if (loading) {
    return <Loading fullScreen text={t('directory.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container} animated>
      {/* الهيدر */}
      <View style={[styles.header, { paddingHorizontal: headerPadding }]}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <Text
            style={[styles.title, isSmallScreen && styles.titleSmall]}
            accessibilityRole="header"
            numberOfLines={1}
          >
            {t('directory.title')}
          </Text>
        </View>
        {isAdmin && (
          <Pressable
            onPress={() => navigation.navigate('AddUser')}
            hitSlop={6}
            style={({ pressed }) => [
              styles.addButton,
              isSmallScreen && styles.addButtonCompact,
              pressed && styles.roundButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('addUser.entry')}
          >
            <Ionicons name="person-add" size={18} color={colors.textWhite} />
            {!isSmallScreen && <Text style={styles.addButtonText}>{t('addUser.entry')}</Text>}
          </Pressable>
        )}
      </View>

      {/* البحث والتصفية: بحث، إدارة، والمتصلون الآن */}
      <View style={[styles.filtersContainer, { paddingHorizontal: headerPadding }]}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('directory.searchPlaceholder')}
          onClear={() => setSearchQuery('')}
        />
        <View style={styles.filterRow}>
          <SelectField
            value={departmentId}
            options={departmentOptions}
            onSelect={setDepartmentId}
            placeholder={t('directory.allDepartments')}
            compact
            presentation="sheet"
            sheetTitle={t('directory.allDepartments')}
            style={styles.departmentField}
            emptyText={t('org.noOptions')}
          />
          <Pressable
            onPress={() => setOnlineOnly((value) => !value)}
            style={({ pressed }) => [
              styles.onlineChip,
              onlineOnly && styles.onlineChipActive,
              pressed && styles.roundButtonPressed,
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: onlineOnly }}
          >
            <View style={[styles.onlineDot, onlineOnly && styles.onlineDotActive]} />
            <Text style={[styles.onlineChipText, onlineOnly && styles.onlineChipTextActive]}>
              {t('directory.onlineNow')}
            </Text>
          </Pressable>
          {fetching ? <ActivityIndicator size="small" color={colors.primaryLight} /> : null}
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
          keyboardDismissMode="on-drag"
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

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    // Blends into the page: a modern large-title header without a divider.
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  titleBorder: {
    // A short brand accent beside the title.
    width: 4,
    height: 22,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    shadowColor: colors.primaryLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  addButtonCompact: {
    width: 40,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  addButtonText: {
    ...typography.buttonSmall,
    color: colors.textWhite,
  },
  filtersContainer: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  departmentField: {
    flex: 1,
    marginBottom: 0,
  },
  onlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  onlineChipActive: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textLight,
  },
  onlineDotActive: {
    backgroundColor: colors.success,
  },
  onlineChipText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  onlineChipTextActive: {
    color: colors.success,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  listContentLandscape: {
    paddingHorizontal: '15%',
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  employeeOrg: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  callButton: {
    backgroundColor: colors.primarySoft,
  },
  editButton: {
    backgroundColor: colors.background,
  },
  roundButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
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
