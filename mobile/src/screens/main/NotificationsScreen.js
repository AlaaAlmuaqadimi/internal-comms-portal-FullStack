import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import NotificationItem from '../../components/NotificationItem';
import Modal from '../../components/Modal';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import SearchBar from '../../components/SearchBar';
import UserAvatar from '../../components/UserAvatar';
import WheelPicker from '../../components/WheelPicker';
import { mockData } from '../../utils/mockData';
import { api, isBackendConfigured } from '../../services/api';
import {
  loadNotificationSound,
  playNotificationSound,
} from '../../services/sound';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';

const STORAGE_KEY = 'notifications.items.v1';

const TYPE_KEYS = {
  'إعلان': 'announcement',
  'تعميم': 'circular',
  'مراسلة': 'message',
};

const seedNotifications = () =>
  mockData.notifications.map((notification) => ({
    ...notification,
    typeKey: TYPE_KEYS[notification.type] || 'announcement',
    audience: 'all',
  }));

const formatExpiry = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const normalizeEmployee = (employee) => ({
  id: employee.id || employee.employeeId || employee.userId,
  name:
    employee.name ||
    employee.fullNameAr ||
    employee.full_name_ar ||
    employee.fullNameEn ||
    employee.username ||
    '',
  unitName:
    employee.unitName ||
    employee.unit_name ||
    employee.orgUnitName ||
    employee.orgUnitNameAr ||
    employee.org_unit_name ||
    employee.orgUnitNameEn ||
    employee.management ||
    '',
  avatarUrl: employee.avatarUrl || employee.avatar_url || '',
});

// The API returns every employee; duplicates (and rows without an id/name) are
// dropped so the recipient count and the "select all" math stay correct.
const normalizeDirectory = (rows) => {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const employee = normalizeEmployee(row || {});
    if (!employee.id || seen.has(employee.id)) continue;
    seen.add(employee.id);
    out.push(employee);
  }
  return out;
};

const NotificationsScreen = () => {
  const { width, height } = useWindowDimensions();
  const { t, align, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // نموذج إنشاء إشعار
  const [createVisible, setCreateVisible] = useState(false);
  const [newType, setNewType] = useState('announcement');
  const [newRecipients, setNewRecipients] = useState([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newDuration, setNewDuration] = useState('24h');
  const [durationPickerVisible, setDurationPickerVisible] = useState(false);
  const [draftDuration, setDraftDuration] = useState('24h');
  const [createErrors, setCreateErrors] = useState({});
  const [clock, setClock] = useState(() => Date.now());
  const [employees, setEmployees] = useState(() =>
    normalizeDirectory(mockData.employees)
  );

  const durationOptions = useMemo(
    () => [
      { key: '24h', hours: 24, label: t('notifications.duration1d') },
      { key: '2d', hours: 48, label: t('notifications.duration2d') },
      { key: '7d', hours: 24 * 7, label: t('notifications.duration7d') },
      { key: '14d', hours: 24 * 14, label: t('notifications.duration14d') },
      { key: '30d', hours: 24 * 30, label: t('notifications.duration30d') },
    ],
    [t]
  );

  const typeOptions = useMemo(
    () => [
      {
        key: 'announcement',
        label: t('notifications.typeAnnouncement'),
        icon: 'megaphone',
      },
      {
        key: 'circular',
        label: t('notifications.typeCircular'),
        icon: 'calendar',
      },
      {
        key: 'message',
        label: t('notifications.typeMessage'),
        icon: 'mail',
      },
    ],
    [t]
  );

  const durationLabel =
    durationOptions.find((option) => option.key === newDuration)?.label || '';

  const typeLabel =
    typeOptions.find((option) => option.key === newType)?.label || '';

  // A notification is only visible during the duration chosen when it was
  // published. The clock ticks every 30s so an item disappears on its own
  // while the screen is open, not just after a reload.
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const visibleNotifications = useMemo(
    () =>
      notifications.filter(
        (item) => !item.expiresAt || item.expiresAt > clock
      ),
    [notifications, clock]
  );

  // Drop expired items from state (and therefore from storage) as soon as the
  // clock passes their expiry, so a notification really disappears when the
  // chosen duration is over.
  useEffect(() => {
    setNotifications((prev) => {
      const next = prev.filter(
        (item) => !item.expiresAt || item.expiresAt > clock
      );
      return next.length === prev.length ? prev : next;
    });
  }, [clock]);

  const filteredEmployees = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) =>
      [employee.name, employee.unitName, localizeText(employee.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [employees, recipientQuery]);

  const allEmployeeIds = useMemo(
    () => employees.map((employee) => employee.id),
    [employees]
  );

  const allSelected =
    allEmployeeIds.length > 0 &&
    allEmployeeIds.every((id) => newRecipients.includes(id));

  // Load the directory so recipients are real employees when the backend is
  // available, with the sample directory as an offline fallback.
  useEffect(() => {
    if (!isBackendConfigured()) return undefined;

    let cancelled = false;
    api.employees
      .getAll()
      .then((rows) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const directory = normalizeDirectory(rows);
        if (directory.length) setEmployees(directory);
      })
      .catch(() => {
        // Keep the fallback directory.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          setNotifications(
            parsed.filter((item) => !item.expiresAt || item.expiresAt > now)
          );
          return;
        }
      }
      setNotifications(seedNotifications());
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications(seedNotifications());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Keep the list on the device so a published notification survives an app
  // restart instead of resetting to the sample data.
  useEffect(() => {
    if (loading) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)).catch(
      () => {}
    );
  }, [notifications, loading]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const handleNotificationPress = (notification) => {
    setSelectedNotification(notification);
    setModalVisible(true);
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, unread: false } : item
      )
    );
  };

  const getIconName = (icon) => {
    switch (icon) {
      case 'megaphone':
        return 'megaphone';
      case 'mail':
        return 'mail';
      case 'calendar':
        return 'calendar';
      case 'alert':
        return 'alert-circle';
      case 'info':
        return 'information-circle';
      default:
        return 'notifications';
    }
  };

  const getIconColor = (notification) => {
    switch (notification?.typeKey || notification?.type) {
      case 'announcement':
      case 'إعلان':
        return colors.primaryLight;
      case 'circular':
      case 'تعميم':
        return colors.warning;
      case 'message':
      case 'مراسلة':
        return colors.success;
      default:
        return colors.primaryLight;
    }
  };

  const toggleRecipient = (id) => {
    setNewRecipients((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleAllRecipients = () => {
    setNewRecipients(allSelected ? [] : allEmployeeIds);
  };

  const resetCreateForm = () => {
    setNewType('announcement');
    setNewRecipients([]);
    setRecipientQuery('');
    setNewBody('');
    setNewDuration('24h');
    setDraftDuration('24h');
    setDurationPickerVisible(false);
    setCreateErrors({});
  };

  const openDurationPicker = () => {
    setDraftDuration(newDuration);
    setDurationPickerVisible(true);
  };

  const closeDurationPicker = () => {
    setDraftDuration(newDuration);
    setDurationPickerVisible(false);
  };

  const confirmDuration = () => {
    setNewDuration(draftDuration);
    setDurationPickerVisible(false);
  };

  const closeCreateModal = () => {
    setCreateVisible(false);
    resetCreateForm();
  };

  const handleCreateNotification = async () => {
    const errs = {};
    if (!newRecipients.length) {
      errs.recipients = t('notifications.validationRecipient');
    }
    if (!newBody.trim()) errs.body = t('notifications.validationBody');
    setCreateErrors(errs);
    if (Object.keys(errs).length) return;

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours24 = now.getHours();
    const period = hours24 >= 12 ? 'م' : 'ص';
    const hours12 = hours24 % 12 || 12;
    const time = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${period}`;

    const typeOption = typeOptions.find((option) => option.key === newType);
    const durationOption = durationOptions.find(
      (option) => option.key === newDuration
    );
    const hours = durationOption?.hours || 24;
    const body = newBody.trim();
    const firstLine = body.split('\n')[0].trim();
    const title = firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;

    const notification = {
      id: `${Date.now()}`,
      typeKey: newType,
      type: typeOption?.label || typeLabel,
      title: title || typeOption?.label || typeLabel,
      summary: body.slice(0, 120),
      body,
      icon: typeOption?.icon || 'megaphone',
      date,
      time,
      unread: true,
      createdAt: now.getTime(),
      expiresAt: now.getTime() + hours * 60 * 60 * 1000,
      durationKey: newDuration,
      audience: allSelected ? 'all' : 'selected',
      recipientIds: allSelected ? [] : [...newRecipients],
      recipientCount: newRecipients.length,
    };

    setNotifications((prev) => [notification, ...prev]);
    closeCreateModal();

    // Give the publisher the same audible feedback the recipients would get.
    try {
      const sound = await loadNotificationSound();
      playNotificationSound(sound);
    } catch {
      // Sound is optional feedback.
    }
  };

  // أحجام متجاوبة
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const iconSize = isSmallScreen ? 24 : isLargeScreen ? 40 : 32;

  const renderNotification = ({ item }) => (
    <NotificationItem
      notification={item}
      onPress={() => handleNotificationPress(item)}
    />
  );

  if (loading) {
    return <Loading fullScreen text={t('notifications.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={[styles.header, { padding: headerPadding }]}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View>
            <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
              {t('notifications.title')}
            </Text>
            <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              {t('notifications.subtitle')}
            </Text>
          </View>
        </View>
        <View style={[styles.headerActions, { alignItems: 'flex-start' }]}>
          <Pressable style={styles.createButton} onPress={() => setCreateVisible(true)}>
            <Ionicons name="add" size={18} color={colors.textWhite} />
            <Text style={styles.createButtonText}>{t('notifications.create')}</Text>
          </Pressable>
          <View style={styles.badge}>
            <Text style={[styles.badgeText, isSmallScreen && styles.badgeTextSmall]}>
              {t('notifications.demoBadge')}
            </Text>
          </View>
        </View>
      </View>

      {/* قائمة الإشعارات */}
      {visibleNotifications.length === 0 ? (
        <EmptyState
          icon="notifications-off"
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyDescription')}
        />
      ) : (
        <FlatList
          data={visibleNotifications}
          renderItem={renderNotification}
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

      {/* نافذة تفاصيل الإشعار */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('notifications.detailsTitle')}
        size="medium"
      >
        {selectedNotification && (
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }]}>
                <Ionicons
                  name={getIconName(selectedNotification.icon)}
                  size={iconSize / 2}
                  color={getIconColor(selectedNotification)}
                />
              </View>
              <Text style={[styles.modalType, isSmallScreen && styles.modalTypeSmall]}>
                {selectedNotification.typeKey
                  ? typeOptions.find((option) => option.key === selectedNotification.typeKey)?.label ||
                    localizeText(selectedNotification.type)
                  : localizeText(selectedNotification.type)}
              </Text>
            </View>

            <Text style={[styles.modalTitle, isSmallScreen && styles.modalTitleSmall]}>
              {localizeText(selectedNotification.title)}
            </Text>
            <Text style={[styles.modalBody, { textAlign: align }, isSmallScreen && styles.modalBodySmall]}>
              {localizeText(selectedNotification.body)}
            </Text>

            {!!selectedNotification.recipientCount && (
              <Text style={styles.modalMeta}>
                {t('notifications.detailsRecipients', {
                  count: selectedNotification.recipientCount,
                })}
              </Text>
            )}

            {!!selectedNotification.expiresAt && (
              <Text style={styles.modalMeta}>
                {t('notifications.detailsExpires', {
                  date: formatExpiry(selectedNotification.expiresAt),
                })}
              </Text>
            )}

            <Text style={[styles.modalDate, isSmallScreen && styles.modalDateSmall]}>
              {selectedNotification.date} · {selectedNotification.time}
            </Text>
          </View>
        )}
      </Modal>

      {/* نافذة إنشاء إشعار */}
      <Modal
        visible={createVisible}
        onClose={durationPickerVisible ? closeDurationPicker : closeCreateModal}
        title={
          durationPickerVisible
            ? t('notifications.durationTitle')
            : t('notifications.createTitle')
        }
        size={durationPickerVisible ? 'small' : 'large'}
        style={{ maxHeight: height * 0.92 }}
      >
        {durationPickerVisible ? (
          <View style={styles.durationPickerBody}>
            <Text style={styles.durationModalHint}>
              {t('notifications.durationHint')}
            </Text>
            <WheelPicker
              options={durationOptions}
              value={draftDuration}
              onChange={setDraftDuration}
            />
            <View style={styles.durationModalActions}>
              <CustomButton
                title={t('common.cancel')}
                onPress={closeDurationPicker}
                variant="outline"
                size="small"
                style={styles.durationActionButton}
              />
              <CustomButton
                title={t('common.confirm')}
                onPress={confirmDuration}
                size="small"
                icon="checkmark"
                style={styles.durationActionButton}
              />
            </View>
          </View>
        ) : (
        <ScrollView
          style={[styles.createScroll, { maxHeight: height * 0.72 }]}
          contentContainerStyle={styles.createContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={styles.createSubtitle}>{t('notifications.createSubtitle')}</Text>

          {/* نوع الإشعار */}
          <Text style={styles.createLabel}>{t('notifications.typeLabel')}</Text>
          <View style={styles.chipRow}>
            {typeOptions.map((option) => {
              const active = newType === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setNewType(option.key)}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={active ? colors.textWhite : colors.primaryLight}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* المستهدفون */}
          <View style={styles.labelRow}>
            <Text style={styles.createLabel}>{t('notifications.recipientLabel')}</Text>
            <Text style={styles.labelCounter}>
              {t('notifications.selectedCount', {
                count: newRecipients.length,
                total: employees.length,
              })}
            </Text>
          </View>

          <View style={styles.recipientsPanel}>
            <Pressable
              style={[styles.selectAllRow, allSelected && styles.selectAllRowActive]}
              onPress={toggleAllRecipients}
            >
              <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
                {allSelected && (
                  <Ionicons name="checkmark" size={14} color={colors.textWhite} />
                )}
              </View>
              <View style={styles.recipientInfo}>
                <Text style={styles.selectAllText}>
                  {t('notifications.selectAllRecipients')}
                </Text>
                <Text style={styles.recipientMeta}>
                  {t('notifications.selectAllHint')}
                </Text>
              </View>
              <Ionicons name="people-outline" size={20} color={colors.primaryLight} />
            </Pressable>

            <SearchBar
              value={recipientQuery}
              onChangeText={setRecipientQuery}
              placeholder={t('notifications.searchRecipients')}
              onClear={() => setRecipientQuery('')}
              style={styles.recipientSearch}
            />

            <ScrollView
              style={styles.recipientScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {filteredEmployees.length === 0 ? (
                <Text style={[styles.emptyRecipients, { textAlign: align }]}>
                  {t('common.noOptions')}
                </Text>
              ) : (
                filteredEmployees.map((employee) => {
                  const active = newRecipients.includes(employee.id);
                  return (
                    <Pressable
                      key={employee.id}
                      style={[
                        styles.recipientRow,
                        active && styles.recipientRowActive,
                      ]}
                      onPress={() => toggleRecipient(employee.id)}
                    >
                      <UserAvatar
                        person={{
                          name: employee.name,
                          avatarUrl: employee.avatarUrl,
                        }}
                        size="small"
                      />
                      <View style={styles.recipientInfo}>
                        <Text numberOfLines={1} style={styles.recipientName}>
                          {localizeText(employee.name)}
                        </Text>
                        {!!employee.unitName && (
                          <Text numberOfLines={1} style={styles.recipientMeta}>
                            {localizeText(employee.unitName)}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.checkbox, active && styles.checkboxChecked]}>
                        {active && (
                          <Ionicons name="checkmark" size={14} color={colors.textWhite} />
                        )}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
          {createErrors.recipients && (
            <Text style={styles.createError}>{createErrors.recipients}</Text>
          )}

          {/* نص الإشعار */}
          <CustomInput
            label={t('notifications.bodyLabel')}
            placeholder={t('notifications.bodyPlaceholder')}
            value={newBody}
            onChangeText={setNewBody}
            multiline
            numberOfLines={4}
            required
            error={createErrors.body}
            style={styles.bodyField}
          />

          {/* مدة العرض - تُفتح كبكرة دوّارة بداخل نافذة مستقلة */}
          <View style={styles.durationHeader}>
            <Text style={styles.createLabel}>{t('notifications.durationLabel')}</Text>
            <View style={styles.durationPill}>
              <Ionicons name="time-outline" size={14} color={colors.primaryLight} />
              <Text style={styles.durationPillText}>{durationLabel}</Text>
            </View>
          </View>
          <Text style={styles.durationHint}>{t('notifications.durationHint')}</Text>

          <Pressable
            style={styles.durationTrigger}
            onPress={openDurationPicker}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.durationPick')}
          >
            <View style={styles.durationTriggerIcon}>
              <Ionicons name="timer-outline" size={20} color={colors.primaryLight} />
            </View>
            <View style={styles.durationTriggerBody}>
              <Text style={styles.durationTriggerCaption}>
                {t('notifications.durationPick')}
              </Text>
              <Text style={styles.durationTriggerValue}>{durationLabel}</Text>
            </View>
            <Ionicons
              name="chevron-down"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>

          <CustomButton
            title={t('notifications.submit')}
            onPress={handleCreateNotification}
            icon="send"
            style={styles.createSubmit}
          />
        </ScrollView>
        )}
      </Modal>

      {/* الفوتر */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, isSmallScreen && styles.footerTextSmall]}>
          {t('notifications.footer')}
        </Text>
      </View>
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
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f6f0e4',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerActions: {
    gap: spacing.sm,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createButtonText: {
    ...typography.captionBold,
    color: colors.textWhite,
  },
  createScroll: {
    maxHeight: 480,
  },
  createContent: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  createSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  createLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  labelCounter: {
    ...typography.caption,
    color: colors.primaryLight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  chipText: {
    ...typography.captionBold,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.textWhite,
  },
  recipientsPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.infoLight,
  },
  selectAllRowActive: {
    borderWidth: 2,
  },
  selectAllText: {
    ...typography.bodySmallBold,
    color: colors.text,
  },
  recipientSearch: {
    backgroundColor: colors.surface,
  },
  recipientScroll: {
    maxHeight: 190,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recipientRowActive: {
    backgroundColor: colors.selectedSurface,
  },
  recipientInfo: {
    flex: 1,
    minWidth: 0,
  },
  recipientName: {
    ...typography.bodySmallBold,
    color: colors.text,
  },
  recipientMeta: {
    ...typography.small,
    color: colors.textSecondary,
  },
  emptyRecipients: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  bodyField: {
    marginTop: spacing.xs,
  },
  durationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  durationPillText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  durationHint: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  durationTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  durationTriggerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  durationTriggerBody: {
    flex: 1,
    minWidth: 0,
  },
  durationTriggerCaption: {
    ...typography.small,
    color: colors.textLight,
  },
  durationTriggerValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  durationModalHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  durationPickerBody: {
    paddingVertical: spacing.xs,
  },
  durationModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  durationActionButton: {
    flex: 1,
  },
  createError: {
    ...typography.caption,
    color: colors.danger || '#d33',
  },
  createSubmit: {
    marginTop: spacing.lg,
  },
  badgeText: {
    ...typography.captionBold,
    color: '#785e30',
  },
  badgeTextSmall: {
    fontSize: 10,
  },
  listContent: {
    padding: spacing.md,
  },
  listContentLandscape: {
    paddingHorizontal: '15%',
  },
  modalContent: {
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalIcon: {
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  modalType: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  modalTypeSmall: {
    fontSize: 13,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalTitleSmall: {
    fontSize: 16,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  modalBodySmall: {
    fontSize: 13,
  },
  modalMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  modalDate: {
    ...typography.caption,
    color: colors.textLight,
  },
  modalDateSmall: {
    fontSize: 10,
  },
  footer: {
    padding: spacing.sm,
    alignItems: 'center',
  },
  footerText: {
    ...typography.small,
    color: '#78889a',
  },
  footerTextSmall: {
    fontSize: 10,
  },
});

export default NotificationsScreen;
