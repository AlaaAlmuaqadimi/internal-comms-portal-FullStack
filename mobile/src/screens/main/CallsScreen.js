import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import SearchBar from '../../components/SearchBar';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import UserAvatar from '../../components/UserAvatar';
import CustomButton from '../../components/CustomButton';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';
import { flipStyles } from '../../i18n/rtlStyles';
import { useCall, useStartCall } from '../../context/CallContext';

// The API returns the call view built by `callView.service.js`. The history
// screen renders exactly those fields; nothing here comes from mock data.
function counterpartOf(call) {
  return call?.direction === 'outgoing' ? call?.callee : call?.caller;
}

function typeOf(call) {
  if (call?.status === 'missed') return 'missed';
  return call?.direction === 'outgoing' ? 'outgoing' : 'incoming';
}

function formatDuration(seconds) {
  const total = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatWhen(iso, locale) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' };
  return {
    date: date.toLocaleDateString(locale),
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  };
}

const CallsScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;

  const [calls, setCalls] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const loadCalls = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.calls.getAll();
      setCalls(Array.isArray(data?.calls) ? data.calls : []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const filteredCalls = useMemo(() => {
    let filtered = [...calls];

    if (debouncedSearch) {
      const query = debouncedSearch.trim().toLowerCase();
      filtered = filtered.filter((call) => {
        const person = counterpartOf(call) || {};
        return [person.name, person.nameEn, person.unitName, person.unitNameEn]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((call) => typeOf(call) === selectedType);
    }

    return filtered;
  }, [calls, debouncedSearch, selectedType]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCalls({ silent: true });
    setRefreshing(false);
  }, [loadCalls]);

  const startCall = useStartCall();
  const handleCallPress = (call) => {
    // Redacted leadership calls expose no employee id and must not be callable.
    if (call?.canCallBack === false) return;
    const person = counterpartOf(call);
    if (!person?.employeeId) return;
    startCall(person.employeeId);
  };

  // Refresh the history when a live call finishes.
  const { lastEndedAt } = useCall();
  useEffect(() => {
    if (lastEndedAt) loadCalls({ silent: true });
  }, [lastEndedAt, loadCalls]);

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
        return 'arrow-down';
      case 'outgoing':
        return 'arrow-up';
      default:
        return 'call';
    }
  };

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'small' : isLargeScreen ? 'large' : 'medium';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const dateLocale = isRTL ? 'ar-LY' : 'en-GB';

  const renderCall = ({ item }) => {
    const person = counterpartOf(item) || {};
    const type = typeOf(item);
    const { date, time } = formatWhen(item.initiatedAt, dateLocale);
    const typeLabel =
      type === 'missed'
        ? t('calls.typeMissed')
        : type === 'outgoing'
        ? t('calls.typeOutgoing')
        : t('calls.typeIncoming');
    const canCall = item.canCallBack !== false && Boolean(person.employeeId);

    return (
      <View
        style={[
          styles.callCard,
          { padding: cardPadding },
          type === 'missed' && styles.callCardMissed,
        ]}
      >
        <View style={styles.callHeader}>
          <UserAvatar
            person={{ name: person.name, avatarUrl: person.avatarUrl }}
            size={avatarSize}
          />
          <View style={styles.callInfo}>
            <Text style={[styles.callName, isSmallScreen && styles.callNameSmall]}>
              {localizeText(person.name || '')}
            </Text>
            {!!person.unitName && (
              <Text style={[styles.callUnit, isSmallScreen && styles.callUnitSmall]}>
                {localizeText(person.unitName)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.callDetails}>
          <View style={styles.callType}>
            <Ionicons
              name={getTypeIcon(type)}
              size={isSmallScreen ? 14 : 16}
              color={getTypeColor(type)}
            />
            <Text
              style={[
                styles.callTypeText,
                { color: getTypeColor(type) },
                isSmallScreen && styles.callTypeTextSmall,
              ]}
            >
              {typeLabel}
            </Text>
          </View>
          <Text style={[styles.callDate, isSmallScreen && styles.callDateSmall]}>
            {date}
            {time ? ` · ${time}` : ''}
          </Text>
          {item.durationSeconds > 0 && (
            <Text style={[styles.callDuration, isSmallScreen && styles.callDurationSmall]}>
              {t('calls.duration', { duration: formatDuration(item.durationSeconds) })}
            </Text>
          )}
        </View>

        <View style={styles.callActions}>
          <CustomButton
            title={t('calls.callButton')}
            onPress={() => handleCallPress(item)}
            icon="call"
            size="small"
            disabled={!canCall}
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return <Loading fullScreen text={t('calls.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={[styles.header, { padding: headerPadding }]}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View>
            <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
              {t('calls.title')}
            </Text>
            <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              {t('calls.subtitle')}
            </Text>
          </View>
        </View>
        <View style={styles.countBadge}>
          <Text style={[styles.countText, isSmallScreen && styles.countTextSmall]}>
            {filteredCalls.length}
          </Text>
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={[styles.filtersContainer, { padding: headerPadding }]}>
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
                  isSmallScreen && styles.filterChipTextSmall,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* قائمة المكالمات */}
      {error && calls.length === 0 ? (
        <EmptyState
          icon="cloud-offline"
          title={t('calls.fetchErrorTitle')}
          description={t('calls.fetchError')}
          actionTitle={t('calls.retry')}
          onAction={() => loadCalls()}
        />
      ) : filteredCalls.length === 0 ? (
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
          contentContainerStyle={[
            styles.listContent,
            isLandscape && styles.listContentLandscape,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: spacing.md,
  flex: 1,
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
  countTextSmall: {
    fontSize: 16,
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
  filterChipTextSmall: {
    fontSize: 11,
  },
  filterChipTextActive: {
    color: colors.textWhite,
  },
  listContent: {
    padding: spacing.md,
  },
  listContentLandscape: {
    paddingHorizontal: '15%',
  },
  callCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  gap: spacing.md,
  marginBottom: spacing.sm,
  },
  callInfo: {
    flex: 1,
  },
  callName: {
    ...typography.h4,
    color: colors.text,
  },
  callNameSmall: {
    fontSize: 14,
  },
  callUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  callUnitSmall: {
    fontSize: 11,
  },
  callDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  callType: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs,
  marginBottom: spacing.xs,
},
callTypeText: {
  ...typography.bodySmallBold,
},
  callTypeTextSmall: {
    fontSize: 11,
  },
  callDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  callDateSmall: {
    fontSize: 10,
  },
  callDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  callDurationSmall: {
    fontSize: 10,
  },
  callActions: {
    alignItems: 'flex-start',
  },
});

export default CallsScreen;
