import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
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
import Modal from '../../components/Modal';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';

const DirectoryScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    filterEmployees();
  }, [debouncedSearch, selectedDepartment, selectedSection, selectedStatus, employees]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      // محاكاة تحميل البيانات
      await new Promise(resolve => setTimeout(resolve, 800));
      setEmployees(mockData.employees);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = [...employees];

    // البحث
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(query) ||
        emp.management.toLowerCase().includes(query) ||
        emp.unitName.toLowerCase().includes(query)
      );
    }

    // التصفية حسب الإدارة
    if (selectedDepartment) {
      filtered = filtered.filter(emp => emp.management === selectedDepartment);
    }

    // التصفية حسب القسم
    if (selectedSection) {
      filtered = filtered.filter(emp => emp.unitName === selectedSection);
    }

    // التصفية حسب الحالة
    if (selectedStatus) {
      filtered = filtered.filter(emp => emp.status === selectedStatus);
    }

    setFilteredEmployees(filtered);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEmployees();
    setRefreshing(false);
  }, []);

  const handleContactPress = (employee) => {
    setSelectedEmployee(employee);
    setModalVisible(true);
  };

  const handleCall = () => {
    setModalVisible(false);
    if (selectedEmployee) {
      navigation.navigate('CallActive', { contact: selectedEmployee });
    }
  };

  const handleMessage = () => {
    setModalVisible(false);
    // يمكن إضافة وظيفة إرسال رسالة هنا
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('');
    setSelectedSection('');
    setSelectedStatus('');
  };

  const departments = [...new Set(employees.map(emp => emp.management))];
  const sections = [...new Set(employees.map(emp => emp.unitName))];

  const renderEmployee = ({ item }) => (
    <View style={styles.employeeCard}>
      <View style={styles.employeeHeader}>
        <UserAvatar person={item} size="large" />
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{localizeText(item.name)}</Text>
          <Text style={styles.employeeUnit}>{localizeText(item.unitName)}</Text>
        </View>
      </View>

      <View style={styles.employeeDetails}>
        <Text style={styles.employeeDetail}>
          <Text style={styles.detailLabel}>{t('directory.managementLabel')}</Text>
          {localizeText(item.management) || '—'}
        </Text>
        <Text style={styles.employeeDetail}>
          <Text style={styles.detailLabel}>{t('directory.unitLabel')}</Text>
          {localizeText(item.unitName) || '—'}
        </Text>
      </View>

      <View style={styles.employeeActions}>
        <StatusBadge status={item.status} />
        <CustomButton
          title={t('directory.callButton')}
          onPress={() => handleContactPress(item)}
          icon="call"
          size="small"
        />
      </View>
    </View>
  );

  if (loading) {
    return <Loading fullScreen text={t('directory.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <View>
              <Text style={styles.title}>{t('directory.title')}</Text>
              <Text style={styles.subtitle}>
                {t('directory.subtitle')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Register')}
            style={styles.addButton}
          >
            <Ionicons name="person-add" size={20} color={colors.textWhite} />
            <Text style={styles.addButtonText}>{t('directory.createAccount')}</Text>
          </Pressable>
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={styles.filtersContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('directory.searchPlaceholder')}
          onClear={() => setSearchQuery('')}
        />

        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, selectedDepartment && styles.filterChipActive]}
            onPress={() => setSelectedDepartment(selectedDepartment ? '' : departments[0])}
          >
            <Text style={[styles.filterChipText, selectedDepartment && styles.filterChipTextActive]}>
              {localizeText(selectedDepartment) || t('directory.allDepartments')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, selectedSection && styles.filterChipActive]}
            onPress={() => setSelectedSection(selectedSection ? '' : sections[0])}
          >
            <Text style={[styles.filterChipText, selectedSection && styles.filterChipTextActive]}>
              {localizeText(selectedSection) || t('directory.allSections')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, selectedStatus && styles.filterChipActive]}
            onPress={() => setSelectedStatus(selectedStatus ? '' : 'online')}
          >
            <Text style={[styles.filterChipText, selectedStatus && styles.filterChipTextActive]}>
              {selectedStatus === 'online' ? t('directory.online') : selectedStatus === 'offline' ? t('directory.offline') : t('directory.allStatuses')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.filterFooter}>
          <Pressable onPress={resetFilters} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>{t('directory.resetFilters')}</Text>
          </Pressable>
          <Text style={styles.resultsCount}>
            {t('directory.resultsCount', { count: filteredEmployees.length })}
          </Text>
        </View>
      </View>

      {/* تنبيه */}
      <View style={styles.alert}>
        <Ionicons name="shield-check" size={20} color={colors.primaryLight} />
        <Text style={styles.alertText}>
          {t('directory.alert')}
        </Text>
      </View>

      {/* قائمة الموظفين */}
      {filteredEmployees.length === 0 ? (
        <EmptyState
          icon="search"
          title={t('directory.noResultsTitle')}
          description={t('directory.noResultsDescription')}
          actionTitle={t('directory.resetSearch')}
          onAction={resetFilters}
        />
      ) : (
        <FlatList
          data={filteredEmployees}
          renderItem={renderEmployee}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
            <Text style={styles.modalName}>{localizeText(selectedEmployee.name)}</Text>
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
                onPress={handleMessage}
                variant="outline"
                icon="mail"
                style={styles.modalButton}
              />
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  titleBorder: {
    width: 4,
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    ...typography.buttonSmall,
    color: colors.textWhite,
    marginRight: spacing.xs,
  },
  filtersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  filterChipText: {
    ...typography.captionBold,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.textWhite,
  },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  resetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  resetButtonText: {
    ...typography.buttonSmall,
    color: colors.primaryLight,
  },
  resultsCount: {
    ...typography.bodyBold,
    color: colors.text,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#edf5fa',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#d9e6ee',
    padding: spacing.md,
    margin: spacing.md,
  },
  alertText: {
    ...typography.bodySmall,
    color: '#27455b',
    flex: 1,
    marginRight: spacing.sm,
    lineHeight: 20,
  },
  listContent: {
    padding: spacing.md,
  },
  employeeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  employeeInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  employeeName: {
    ...typography.h4,
    color: colors.text,
  },
  employeeUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  employeeDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  employeeDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  detailLabel: {
    fontWeight: '700',
    color: colors.text,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  modalButton: {
    flex: 1,
  },
});

export default DirectoryScreen;
