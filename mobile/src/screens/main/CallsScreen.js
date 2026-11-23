import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/AppText';
import SafeAreaView from '../../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import SearchBar from '../../components/SearchBar';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import UserAvatar from '../../components/UserAvatar';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import useDebounce from '../../hooks/useDebounce';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView, ScaleInView } from '../../components/Motion';
import { listItemDelay } from '../../constants/motion';
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

/** "0:42", "12:05", or "1:02:05" for calls of an hour or more. */
function formatDuration(seconds) {
  const total = Number.isFinite(Number(seconds)) ? Math.max(0, Math.round(Number(seconds))) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Short, phone-style time: "3:00 ص" today, "أمس 3:00 ص", else "23 نوفمبر". */
function formatWhen(iso, locale, t) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) return time;
  if (days === 1) return `${t('calls.yesterday')} ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(
    locale,
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }
  );
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

  const typeStyle = {
    incoming: { icon: 'arrow-down', color: colors.primaryLight, label: t('calls.typeIncoming') },
    outgoing: { icon: 'arrow-up', color: colors.success, label: t('calls.typeOutgoing') },
    missed: { icon: 'arrow-down', color: colors.danger, label: t('calls.typeMissed') },
  };

  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const dateLocale = isRTL ? 'ar-LY' : 'en-GB';

  // One compact row per call, like a phone's call log: who, how and when,
  // and a call-back button.
  const renderCall = ({ item, index }) => {
    const person = counterpartOf(item) || {};
    const type = typeOf(item);
    const { icon, color, label } = typeStyle[type];
    const name = localizeText(person.name || '');
    const when = formatWhen(item.initiatedAt, dateLocale, t);
    const meta = [label, when].filter(Boolean).join(' · ');
    // Every call shows its duration; calls nobody answered read 0:00.
    const answered = item.durationSeconds > 0 || Boolean(item.answeredAt);
    const duration = formatDuration(item.durationSeconds);
    const canCall = item.canCallBack !== false && Boolean(person.employeeId);

    return (
      <FadeInView delay={listItemDelay(index)} style={styles.row}>
        <UserAvatar person={{ name: person.name, avatarUrl: person.avatarUrl }} size="medium" />
        <View style={styles.rowText}>
          <Text
            style={[styles.rowName, type === 'missed' && styles.rowNameMissed]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {/* How, when, and how long: "↑ صادرة · 3:00 ص · ⏱ 1:23" */}
          <View style={styles.rowMeta}>
            <Ionicons name={icon} size={13} color={color} />
            <Text style={styles.rowMetaText} numberOfLines={1}>
              {meta}
            </Text>
            <Text style={styles.rowMetaText}>·</Text>
            <View
              style={styles.durationInline}
              accessible
              accessibilityLabel={t('calls.duration', { duration })}
            >
              <Ionicons
                name="time-outline"
                size={13}
                color={answered ? colors.textSecondary : colors.textLight}
              />
              <Text style={[styles.durationText, !answered && styles.durationTextMuted]}>
                {duration}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => handleCallPress(item)}
          disabled={!canCall}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('calls.callBack', { name })}
          style={({ pressed }) => [
            styles.callBackButton,
            pressed && styles.callBackButtonPressed,
            !canCall && styles.callBackButtonDisabled,
          ]}
        >
          <Ionicons name="call" size={18} color={colors.primaryLight} />
        </Pressable>
      </FadeInView>
    );
  };

  if (loading) {
    return <Loading fullScreen text={t('calls.loading')} />;
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
          >
            {t('calls.title')}
          </Text>
        </View>
      </View>

      {/* البحث والتصفية */}
      <View style={[styles.filtersContainer, { paddingHorizontal: headerPadding }]}>
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
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedType === filter.key }}
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
          keyboardDismissMode="on-drag"
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
    // Blends into the page: a modern large-title header without a divider.
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  filtersContainer: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  listContentLandscape: {
    paddingHorizontal: '15%',
  },
  row: {
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
  rowText: {
    flex: 1,
  },
  rowName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  rowNameMissed: {
    color: colors.danger,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  rowMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  durationInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  durationText: {
    ...typography.caption,
    color: colors.textSecondary,
    // Digits keep a steady width so durations line up row to row.
    fontVariant: ['tabular-nums'],
  },
  durationTextMuted: {
    color: colors.textLight,
  },
  callBackButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  callBackButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  callBackButtonDisabled: {
    opacity: 0.35,
  },
});

export default CallsScreen;
