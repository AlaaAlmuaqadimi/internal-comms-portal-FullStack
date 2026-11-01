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
import StatusBadge from '../../components/StatusBadge';
import CustomButton from '../../components/CustomButton';
import SelectField from '../../components/SelectField';
import Modal from '../../components/Modal';
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
  const isLandscape = width > height;
  const isAdmin = hasRole(user, 'admin');

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

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
      const orgUnitId = overrides.orgUnitId ?? orgFilter;

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      if (!hasLoadedRef.current) setLoading(true);
      else setFetching(true);

      try {
        const list = await api.employees.list({
          q: q.trim(),
          roleCode,
          orgUnitId,
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
    [debouncedSearch, roleFilter, orgFilter, t]
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
    setOrgFilter('');
    // Run the unfiltered query immediately instead of waiting for the search
    // debounce, so the reset feels instantaneous.
    loadEmployees({ q: '', roleCode: '', orgUnitId: '' });
  }, [loadEmployees]);

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

  const orgFilterOptions = useMemo(() => {
    const options = [{ value: '', label: t('directory.allUnits') }];
    const arrow = isRTL ? '\u2190' : '\u2192';

    const visit = (nodes, depth, parentPath) => {
      for (const unit of nodes || []) {
        const name = localizeText(unit.nameAr || unit.nameEn || unit.code);
        const path = parentPath ? `${parentPath} ${arrow} ${name}` : name;
        options.push({
          value: unit.id,
          label: name,
          description: depth > 0 ? path : undefined,
        });
        visit(unit.children, depth + 1, path);
      }
    };

    visit(orgTree, 0, '');
    return options;
  }, [orgTree, isRTL, language, t]);

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'small' : isLargeScreen ? 'large' : 'medium';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const notAvailable = t('directory.notAvailable');

  const renderEmployee = ({ item }) => {
    const detailRows = [
      {
        icon: 'business-outline',
        label: t('directory.managementLabel'),
        value: item.parentUnitNameAr || item.orgUnitNameAr || notAvailable,
      },
      {
        icon: 'git-branch-outline',
        label: t('directory.unitLabel'),
        value: item.orgUnitNameAr || notAvailable,
      },
      {
        icon: 'call-outline',
        label: t('directory.extensionLabel'),
        value: item.extension || notAvailable,
      },
      {
        icon: 'mail-outline',
        label: t('directory.emailLabel'),
        value: item.email || notAvailable,
      },
      {
        icon: 'at-outline',
        label: t('directory.usernameLabel'),
        value: item.username || t('directory.noAccount'),
      },
    ];

    return (
      <View style={[styles.employeeCard, { padding: cardPadding }]}>
        <View style={styles.employeeHeader}>
          <UserAvatar
            person={{ name: item.fullNameAr, avatar: item.avatarUrl }}
            size={avatarSize}
          />
          <View style={styles.employeeInfo}>
            <Text style={[styles.employeeName, isSmallScreen && styles.employeeNameSmall]}>
              {item.fullNameAr}
            </Text>
            {item.fullNameEn ? (
              <Text style={styles.employeeEnglishName}>{item.fullNameEn}</Text>
            ) : null}
            <Text style={[styles.employeeUnit, isSmallScreen && styles.employeeUnitSmall]}>
              {item.jobTitleAr || notAvailable}
            </Text>
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

        <View style={styles.employeeDetails}>
          {detailRows.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Ionicons name={row.icon} size={14} color={colors.textLight} />
              <Text style={[styles.employeeDetail, isSmallScreen && styles.employeeDetailSmall]}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.employeeActions}>
          <View style={styles.employeeBadges}>
            <StatusBadge status={item.presence === 'online' ? 'online' : 'offline'} />
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
            label={t('directory.roleFilter')}
            value={roleFilter}
            options={roleFilterOptions}
            onSelect={setRoleFilter}
            placeholder={t('directory.allRoles')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={200}
          />
          <SelectField
            label={t('directory.orgFilter')}
            value={orgFilter}
            options={orgFilterOptions}
            onSelect={setOrgFilter}
            placeholder={t('directory.allUnits')}
            style={[styles.filterField, isSmallScreen && styles.filterFieldSmall]}
            maxListHeight={240}
            emptyText={t('org.noOptions')}
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    ...typography.h4,
    color: colors.text,
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
  employeeDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  employeeDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  employeeDetailSmall: {
    fontSize: 11,
  },
  detailLabel: {
    fontFamily: 'Cairo_700Bold',
    color: colors.text,
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
