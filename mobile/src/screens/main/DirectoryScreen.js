import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
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
import Modal from '../../components/Modal';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';

const DirectoryScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  
  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  
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

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(query) ||
        emp.management.toLowerCase().includes(query) ||
        emp.unitName.toLowerCase().includes(query)
      );
    }

    if (selectedDepartment) {
      filtered = filtered.filter(emp => emp.management === selectedDepartment);
    }

    if (selectedSection) {
      filtered = filtered.filter(emp => emp.unitName === selectedSection);
    }

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
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('');
    setSelectedSection('');
    setSelectedStatus('');
  };

  const departments = [...new Set(employees.map(emp => emp.management))];
  const sections = [...new Set(employees.map(emp => emp.unitName))];

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'small' : isLargeScreen ? 'large' : 'medium';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const renderEmployee = ({ item }) => (
    <View style={[styles.employeeCard, { padding: cardPadding }]}>
      <View style={styles.employeeHeader}>
        <UserAvatar person={item} size={avatarSize} />
        <View style={styles.employeeInfo}>
          <Text style={[styles.employeeName, isSmallScreen && styles.employeeNameSmall]}>
            {localizeText(item.name)}
          </Text>
          <Text style={[styles.employeeUnit, isSmallScreen && styles.employeeUnitSmall]}>
            {localizeText(item.unitName)}
          </Text>
        </View>
      </View>

      <View style={styles.employeeDetails}>
        <Text style={[styles.employeeDetail, isSmallScreen && styles.employeeDetailSmall]}>
          <Text style={styles.detailLabel}>{t('directory.managementLabel')}</Text>
          {localizeText(item.management) || '—'}
        </Text>
        <Text style={[styles.employeeDetail, isSmallScreen && styles.employeeDetailSmall]}>
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
      <View style={[styles.header, { padding: headerPadding }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <View>
              <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
                {t('directory.title')}
              </Text>
              <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
                {t('directory.subtitle')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Register')}
            style={styles.addButton}
          >
            <Ionicons name="person-add" size={isSmallScreen ? 16 : 20} color={colors.textWhite} />
            <Text style={[styles.addButtonText, isSmallScreen && styles.addButtonTextSmall]}>
              {t('directory.createAccount')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={[styles.filtersContainer, { padding: headerPadding }]}>
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
            <Text style={[styles.filterChipText, selectedDepartment && styles.filterChipTextActive, isSmallScreen && styles.filterChipTextSmall]}>
              {localizeText(selectedDepartment) || t('directory.allDepartments')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, selectedSection && styles.filterChipActive]}
            onPress={() => setSelectedSection(selectedSection ? '' : sections[0])}
          >
            <Text style={[styles.filterChipText, selectedSection && styles.filterChipTextActive, isSmallScreen && styles.filterChipTextSmall]}>
              {localizeText(selectedSection) || t('directory.allSections')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterChip, selectedStatus && styles.filterChipActive]}
            onPress={() => setSelectedStatus(selectedStatus ? '' : 'online')}
          >
            <Text style={[styles.filterChipText, selectedStatus && styles.filterChipTextActive, isSmallScreen && styles.filterChipTextSmall]}>
              {selectedStatus === 'online' ? t('directory.online') : selectedStatus === 'offline' ? t('directory.offline') : t('directory.allStatuses')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.filterFooter}>
          <Pressable onPress={resetFilters} style={styles.resetButton}>
            <Text style={[styles.resetButtonText, isSmallScreen && styles.resetButtonTextSmall]}>
              {t('directory.resetFilters')}
            </Text>
          </Pressable>
          <Text style={[styles.resultsCount, isSmallScreen && styles.resultsCountSmall]}>
            {t('directory.resultsCount', { count: filteredEmployees.length })}
          </Text>
        </View>
      </View>

      {/* تنبيه */}
      <View style={styles.alert}>
        <Ionicons name="shield-check" size={isSmallScreen ? 16 : 20} color={colors.primaryLight} />
        <Text style={[styles.alertText, isSmallScreen && styles.alertTextSmall]}>
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
          contentContainerStyle={[
            styles.listContent,
            isLandscape && styles.listContentLandscape,
          ]}
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
    height: 50,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginLeft: spacing.md,
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
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    ...typography.buttonSmall,
    color: colors.textWhite,
    marginRight: spacing.xs,
  },
  addButtonTextSmall: {
    fontSize: 11,
  },
  filtersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
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
  filterChipTextSmall: {
    fontSize: 11,
  },
  filterChipTextActive: {
    color: colors.textWhite,
  },
  filterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  resetButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
  resultsCount: {
    ...typography.bodyBold,
    color: colors.text,
  },
  resultsCountSmall: {
    fontSize: 12,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#edf5fa',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#d9e6ee',
    padding: spacing.sm,
    margin: spacing.sm,
  },
  alertText: {
    ...typography.bodySmall,
    color: '#27455b',
    flex: 1,
    marginRight: spacing.sm,
    lineHeight: 18,
  },
  alertTextSmall: {
    fontSize: 11,
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
    marginBottom: spacing.sm,
  },
  employeeInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  employeeName: {
    ...typography.h4,
    color: colors.text,
  },
  employeeNameSmall: {
    fontSize: 14,
  },
  employeeUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  employeeUnitSmall: {
    fontSize: 11,
  },
  employeeDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  employeeDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  employeeDetailSmall: {
    fontSize: 11,
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
});

export default DirectoryScreen;
