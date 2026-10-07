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
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import SearchBar from '../../components/SearchBar';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import UserAvatar from '../../components/UserAvatar';
import CustomButton from '../../components/CustomButton';
import Modal from '../../components/Modal';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';

const CallsScreen = ({ navigation }) => {
  const { t } = useLanguage();
  const [calls, setCalls] = useState([]);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    loadCalls();
  }, []);

  useEffect(() => {
    filterCalls();
  }, [debouncedSearch, selectedType, calls]);

  const loadCalls = async () => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      setCalls(mockData.calls);
    } catch (error) {
      console.error('Error loading calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCalls = () => {
    let filtered = [...calls];

    // البحث
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(call =>
        call.contact.name.toLowerCase().includes(query) ||
        call.contact.unitName.toLowerCase().includes(query) ||
        call.contact.management.toLowerCase().includes(query)
      );
    }

    // التصفية حسب النوع
    if (selectedType !== 'all') {
      filtered = filtered.filter(call => call.type === selectedType);
    }

    setFilteredCalls(filtered);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCalls();
    setRefreshing(false);
  }, []);

  const handleCallPress = (call) => {
    setSelectedCall(call);
    setModalVisible(true);
  };

  const handleStartCall = () => {
    setModalVisible(false);
    if (selectedCall) {
      navigation.navigate('CallActive', { contact: selectedCall.contact });
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'incoming':
        return colors.primaryLight;
      case 'outgoing':
        return colors.success;
      case 'missed':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'incoming':
        return 'arrow-down-left';
      case 'outgoing':
        return 'arrow-up-right';
      case 'missed':
        return 'phone-missed';
      default:
        return 'call';
    }
  };

  const renderCall = ({ item }) => (
    <View style={[styles.callCard, item.type === 'missed' && styles.callCardMissed]}>
      <View style={styles.callHeader}>
        <UserAvatar person={item.contact} size="medium" />
        <View style={styles.callInfo}>
          <Text style={styles.callName}>{localizeText(item.contact.name)}</Text>
          <Text style={styles.callUnit}>{localizeText(item.contact.unitName)}</Text>
        </View>
      </View>

      <View style={styles.callDetails}>
        <View style={styles.callType}>
          <Ionicons name={getTypeIcon(item.type)} size={16} color={getTypeColor(item.type)} />
          <Text style={[styles.callTypeText, { color: getTypeColor(item.type) }]}>
            {localizeText(item.typeLabel)}
          </Text>
        </View>
        <Text style={styles.callDate}>{item.date} · {item.time}</Text>
        <Text style={styles.callDuration}>{t('calls.duration', { duration: item.duration })}</Text>
      </View>

      <View style={styles.callActions}>
        <CustomButton
          title={t('calls.callButton')}
          onPress={() => handleCallPress(item)}
          icon="call"
          size="small"
        />
      </View>
    </View>
  );

  if (loading) {
    return <Loading fullScreen text={t('calls.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View>
            <Text style={styles.title}>{t('calls.title')}</Text>
            <Text style={styles.subtitle}>
              {t('calls.subtitle')}
            </Text>
          </View>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredCalls.length}</Text>
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={styles.filtersContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('calls.searchPlaceholder')}
          onClear={() => setSearchQuery('')}
        />

        <View style={styles.filterRow}>
          {[
            { key: 'all', label: t('calls.filterAll') },
            { key: 'incoming', label: t('calls.filterIncoming') },
            { key: 'outgoing', label: t('calls.filterOutgoing') },
            { key: 'missed', label: t('calls.filterMissed') },
          ].map((filter) => (
            <Pressable
              key={filter.key}
              style={[
                styles.filterChip,
                selectedType === filter.key && styles.filterChipActive,
              ]}
              onPress={() => setSelectedType(filter.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedType === filter.key && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* قائمة المكالمات */}
      {filteredCalls.length === 0 ? (
        <EmptyState
          icon="call"
          title={t('calls.noMatchTitle')}
          description={calls.length > 0 ? t('calls.noMatchDescription') : t('calls.noCallsDescription')}
          actionTitle={calls.length > 0 ? t('calls.resetFilters') : t('calls.openDirectory')}
          onAction={calls.length > 0 ? resetFilters : () => navigation.navigate('Directory')}
        />
      ) : (
        <FlatList
          data={filteredCalls}
          renderItem={renderCall}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      {/* نافذة تأكيد الاتصال */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('calls.confirmTitle')}
        size="small"
      >
        {selectedCall && (
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="call" size={32} color={colors.primaryLight} />
            </View>
            <Text style={styles.modalDescription}>
              {t('calls.confirmDescription')}
            </Text>
            <Text style={styles.modalName}>{localizeText(selectedCall.contact.name)}</Text>
            <View style={styles.modalActions}>
              <CustomButton
                title={t('calls.startCall')}
                onPress={handleStartCall}
                style={styles.modalButton}
              />
              <CustomButton
                title={t('common.cancel')}
                onPress={() => setModalVisible(false)}
                variant="outline"
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
    flexDirection: 'row',
    alignItems: 'center',
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
  countBadge: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countText: {
    ...typography.h4,
    color: colors.primaryLight,
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
  listContent: {
    padding: spacing.md,
  },
  callCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  callCardMissed: {
    borderColor: '#b65b41',
    borderWidth: 2,
  },
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  callInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  callName: {
    ...typography.h4,
    color: colors.text,
  },
  callUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  callDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  callType: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  callTypeText: {
    ...typography.bodySmallBold,
    marginRight: spacing.xs,
  },
  callDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  callDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  callActions: {
    alignItems: 'flex-start',
  },
  modalContent: {
    alignItems: 'center',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eaf1f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  modalName: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.lg,
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

export default CallsScreen;
