import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationsContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius } from '../../constants/spacing';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import NotificationItem from '../../components/NotificationItem';
import Modal from '../../components/Modal';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import SearchBar from '../../components/SearchBar';
import UserAvatar from '../../components/UserAvatar';
import DurationPickerBody from '../../components/DurationPickerBody';
import { mockData } from '../../utils/mockData';
import { api, isBackendConfigured } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import { useAuth } from '../../context/AuthContext';
import { clampDurationHours, formatDurationHours } from '../../utils/duration';
import { isSameEmployee } from '../../utils/isSameEmployee';

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

const isExpired = (item, now = Date.now()) =>
  !!item?.expiresAt && item.expiresAt <= now;

const normalizeEmployee = (employee) => ({
  id: employee.id || employee.employeeId || employee.userId,
  // Identity fields are kept so the signed-in sender can be recognised and
  // removed from the recipients (see utils/isSameEmployee).
  employeeId: employee.employeeId || employee.employee_id || employee.id || '',
  userId: employee.userId || employee.user_id || '',
  username: employee.username || '',
  nameAr: employee.fullNameAr || employee.full_name_ar || '',
  nameEn: employee.fullNameEn || employee.full_name_en || '',
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

  const {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    publish,
  } = useNotifications();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const [receipts, setReceipts] = useState(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  // نموذج إنشاء إشعار
  const [createVisible, setCreateVisible] = useState(false);
  const [newRecipients, setNewRecipients] = useState([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [newBody, setNewBody] = useState('');
  // Only the confirmed number of hours lives here. The wheel draft is owned
  // by DurationPickerBody, so scrolling never re-renders this screen.
  const [newDurationHours, setNewDurationHours] = useState(24);
  const [durationPickerVisible, setDurationPickerVisible] = useState(false);
  // Two tabs only; Incoming is the default.
  const [activeDirection, setActiveDirection] = useState('incoming');
  const [createErrors, setCreateErrors] = useState({});
  const [clock, setClock] = useState(() => Date.now());
  const [employees, setEmployees] = useState(() =>
    normalizeDirectory(mockData.employees)
  );
  const { user } = useAuth();

  const durationLabel = formatDurationHours(newDurationHours, t);

  // A notification is only visible during the duration chosen when it was
  // published. The clock ticks every 30s so an item disappears on its own
  // while the screen is open, not just after a reload.
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  // Incoming: notifications the viewer did not send. An expired one
  // disappears for its recipients (the 30 s clock hides it live).
  // Outgoing: everything the viewer sent, expired or not, newest first. That
  // list is the sender's archive and is never filtered by expiry.
  const incomingNotifications = useMemo(
    () =>
      notifications.filter(
        (item) => !item.isSender && !isExpired(item, clock)
      ),
    [notifications, clock]
  );

  const outgoingNotifications = useMemo(
    () =>
      notifications
        .filter((item) => item.isSender)
        .slice()
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [notifications]
  );

  const unreadIncomingCount = useMemo(
    () => incomingNotifications.filter((item) => item.unread).length,
    [incomingNotifications]
  );

  const directionTabs = [
    {
      key: 'incoming',
      label: t('notifications.tabIncoming'),
      badge: unreadIncomingCount,
    },
    { key: 'outgoing', label: t('notifications.tabOutgoing'), badge: 0 },
  ];

  const displayedNotifications =
    activeDirection === 'incoming'
      ? incomingNotifications
      : outgoingNotifications;

  // The sender is never one of the recipient options: their row is removed
  // before the list is searched, counted or used for "select all".
  const recipientDirectory = useMemo(
    () => employees.filter((employee) => !isSameEmployee(user, employee)),
    [employees, user]
  );

  const filteredEmployees = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return recipientDirectory;

    return recipientDirectory.filter((employee) =>
      [
        employee.name,
        employee.nameAr,
        employee.nameEn,
        employee.unitName,
        localizeText(employee.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [recipientDirectory, recipientQuery]);

  const allEmployeeIds = useMemo(
    () => recipientDirectory.map((employee) => employee.id),
    [recipientDirectory]
  );

  // Keeps only ids that are still offered, so the sender can never stay
  // selected (for example after the real directory replaces the sample one).
  const dropSender = useCallback(
    (ids) => {
      const allowed = new Set(allEmployeeIds.map(String));
      return ids.filter((id) => allowed.has(String(id)));
    },
    [allEmployeeIds]
  );

  useEffect(() => {
    setNewRecipients((prev) => {
      const next = dropSender(prev);
      return next.length === prev.length ? prev : next;
    });
  }, [dropSender]);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // The sender can see exactly who opened the notification and when. Receipts
  // are only fetched for notifications the signed-in employee created; the API
  // also enforces that on the server.
  const loadReceipts = useCallback(async (notificationId) => {
    if (!notificationId || !isBackendConfigured()) return;

    setReceiptsLoading(true);
    try {
      const data = await api.notifications.getReceipts(notificationId);
      setReceipts(data);
    } catch (err) {
      setReceipts({
        recipientCount: 0,
        readCount: 0,
        recipients: [],
        error: err?.message || null,
      });
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  const handleNotificationPress = (notification) => {
    setSelectedNotification(notification);
    setModalVisible(true);
    setReceipts(null);
    if (notification.isSender) {
      // The sender opening their own notification is not a read.
      loadReceipts(notification.id);
      return;
    }
    // A read is recorded only here, when the recipient opens the item.
    if (notification.unread) {
      markRead(notification.id);
    }
  };

  const closeDetailsModal = () => {
    setModalVisible(false);
    setReceipts(null);
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

  const getIconColor = () => colors.primaryLight;

  const toggleRecipient = (id) => {
    setNewRecipients((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleAllRecipients = () => {
    setNewRecipients(allSelected ? [] : allEmployeeIds);
  };

  const resetCreateForm = () => {
    setNewRecipients([]);
    setRecipientQuery('');
    setNewBody('');
    setNewDurationHours(24);
    setDurationPickerVisible(false);
    setCreateErrors({});
  };

  // Opening the form starts clean and strips the sender from any selection.
  const openCreateModal = () => {
    resetCreateForm();
    setNewRecipients((prev) => dropSender(prev));
    setCreateVisible(true);
  };

  const openDurationPicker = () => {
    setDurationPickerVisible(true);
  };

  const closeDurationPicker = () => {
    setDurationPickerVisible(false);
  };

  const confirmDuration = useCallback((hours) => {
    setNewDurationHours(clampDurationHours(hours));
    setDurationPickerVisible(false);
  }, []);

  const closeCreateModal = () => {
    setCreateVisible(false);
    resetCreateForm();
  };

  const handleCreateNotification = async () => {
    // Last guard before sending: the sender is never stored as a recipient.
    const recipients = dropSender(newRecipients);
    const errs = {};
    if (!recipients.length) {
      errs.recipients = t('notifications.validationRecipient');
    }
    if (!newBody.trim()) errs.body = t('notifications.validationBody');
    setCreateErrors(errs);
    if (Object.keys(errs).length) return;

    const hours = clampDurationHours(newDurationHours);
    const body = newBody.trim();

    try {
      // "All" is sent as an explicit list of everyone offered (the sender is
      // already excluded), and the server also drops the sender.
      await publish({
        type: 'announcement',
        body,
        recipientIds: recipients,
        audience: 'selected',
        durationHours: hours,
      });
      closeCreateModal();
      setNotice(t('notifications.submitSuccess'));
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      const field = err?.details?.[0]?.field;
      setCreateErrors({
        [field === 'recipientIds' ? 'recipients' : 'body']:
          err?.message || t('notifications.publishError'),
      });
    }
  };

  // أحجام متجاوبة
  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const iconSize = isSmallScreen ? 24 : isLargeScreen ? 40 : 32;

  const renderNotification = ({ item }) => (
    <NotificationItem
      notification={item}
      expired={isExpired(item, clock)}
      onPress={() => handleNotificationPress(item)}
    />
  );

  const selectedExpired =
    !!selectedNotification && isExpired(selectedNotification, clock);
  const selectedDurationLabel = selectedNotification?.durationHours
    ? formatDurationHours(selectedNotification.durationHours, t)
    : '';

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
          {/* Any employee can send a notification or message. Only the people
              they select receive it, so there is no admin-only gate here. */}
          <Pressable style={styles.createButton} onPress={openCreateModal}>
            <Ionicons name="add" size={18} color={colors.textWhite} />
            <Text style={styles.createButtonText}>{t('notifications.create')}</Text>
          </Pressable>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={[styles.badgeText, isSmallScreen && styles.badgeTextSmall]}>
                {unreadCount > 0
                  ? t('notifications.unreadBadge', { count: unreadCount })
                  : t('notifications.allRead')}
              </Text>
            </View>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                style={styles.markAllButton}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.markAllRead')}
              >
                <Ionicons name="checkmark-done" size={14} color={colors.primaryLight} />
                <Text style={styles.markAllText}>
                  {t('notifications.markAllRead')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {!!notice && (
        <View style={styles.noticeBar}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {/* وارد / صادر — row order follows flipStyles, so Incoming is on the
          right in Arabic. */}
      <View style={styles.tabsBar}>
        <View style={styles.directionTabs}>
          {directionTabs.map((tab) => {
            const active = activeDirection === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.directionTab, active && styles.directionTabActive]}
                onPress={() => setActiveDirection(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.directionTabText,
                    active && styles.directionTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.badge > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{tab.badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* قائمة الإشعارات */}
      {displayedNotifications.length === 0 ? (
        <EmptyState
          icon={
            error
              ? 'cloud-offline-outline'
              : activeDirection === 'incoming'
                ? 'mail-unread-outline'
                : 'paper-plane-outline'
          }
          title={
            error
              ? t('notifications.loadErrorTitle')
              : activeDirection === 'incoming'
                ? t('notifications.emptyIncoming')
                : t('notifications.emptyOutgoing')
          }
          description={error ? t('notifications.loadError') : undefined}
          actionTitle={error ? t('common.retry') : undefined}
          onAction={error ? handleRefresh : undefined}
        />
      ) : (
        <FlatList
          data={displayedNotifications}
          renderItem={renderNotification}
          keyExtractor={(item) => String(item.id)}
          extraData={clock}
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
        onClose={closeDetailsModal}
        title={t('notifications.detailsTitle')}
        size="medium"
      >
        {selectedNotification && (
          <ScrollView
            style={{ maxHeight: height * 0.7 }}
            contentContainerStyle={styles.modalContent}
            nestedScrollEnabled
          >
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }]}>
                <Ionicons
                  name={getIconName(selectedNotification.icon)}
                  size={iconSize / 2}
                  color={getIconColor(selectedNotification)}
                />
              </View>
              <Text style={[styles.modalType, isSmallScreen && styles.modalTypeSmall]}>
                {t('notifications.typeAnnouncement')}
              </Text>
              {selectedNotification.isSender && (
                <View style={styles.senderBadge}>
                  <Ionicons name="send" size={11} color={colors.primaryLight} />
                  <Text style={styles.senderBadgeText}>
                    {t('notifications.senderBadge')}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.modalTitle, isSmallScreen && styles.modalTitleSmall]}>
              {localizeText(selectedNotification.title)}
            </Text>
            <Text style={[styles.modalBody, { textAlign: align }, isSmallScreen && styles.modalBodySmall]}>
              {localizeText(selectedNotification.body)}
            </Text>

            {/* Recipient counts and read state are for the sender only. */}
            {selectedNotification.isSender &&
              !!selectedNotification.recipientCount && (
                <Text style={styles.modalMeta}>
                  {t('notifications.readSummary', {
                    read: receipts
                      ? receipts.readCount
                      : selectedNotification.readCount || 0,
                    total: selectedNotification.recipientCount,
                  })}
                </Text>
              )}

            {selectedNotification.isSender && !!selectedDurationLabel && (
              <Text style={styles.modalMeta}>
                {t('notifications.detailsDuration', {
                  duration: selectedDurationLabel,
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

            {selectedNotification.isSender && selectedExpired && (
              <Text style={styles.modalArchived}>
                {t('notifications.detailsArchived')}
              </Text>
            )}

            <Text style={[styles.modalDate, isSmallScreen && styles.modalDateSmall]}>
              {selectedNotification.date} · {selectedNotification.time}
            </Text>

            {selectedNotification.isSender && (
              <View style={styles.receiptsSection}>
                <Text style={styles.receiptsTitle}>
                  {t('notifications.receiptsTitle')}
                </Text>

                {receiptsLoading ? (
                  <View style={styles.receiptsLoading}>
                    <ActivityIndicator size="small" color={colors.primaryLight} />
                    <Text style={styles.receiptsLoadingText}>
                      {t('notifications.receiptsLoading')}
                    </Text>
                  </View>
                ) : receipts?.error ? (
                  <Pressable
                    style={styles.receiptsRetry}
                    onPress={() => loadReceipts(selectedNotification.id)}
                  >
                    <Ionicons name="refresh" size={14} color={colors.primaryLight} />
                    <Text style={styles.receiptsRetryText}>
                      {t('common.retry')}
                    </Text>
                  </Pressable>
                ) : receipts?.recipients?.length ? (
                  receipts.recipients.map((recipient) => (
                    <View key={recipient.employeeId} style={styles.receiptRow}>
                      <UserAvatar
                        person={{
                          name: recipient.name,
                          avatarUrl: recipient.avatarUrl,
                        }}
                        size="small"
                      />
                      <View style={styles.receiptBody}>
                        <Text style={styles.receiptName} numberOfLines={1}>
                          {localizeText(recipient.name)}
                        </Text>
                        <Text
                          style={[
                            styles.receiptStatus,
                            recipient.read && styles.receiptStatusRead,
                          ]}
                        >
                          {recipient.read
                            ? t('notifications.receiptReadAt', {
                                date: formatExpiry(recipient.readAt),
                              })
                            : t('notifications.receiptUnread')}
                        </Text>
                      </View>
                      <Ionicons
                        name={recipient.read ? 'checkmark-done' : 'time-outline'}
                        size={18}
                        color={recipient.read ? colors.success : colors.textSecondary}
                      />
                    </View>
                  ))
                ) : (
                  <Text style={styles.receiptsEmpty}>
                    {t('notifications.receiptsEmpty')}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
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
        size="large"
        style={{ maxHeight: height * 0.92 }}
      >
        {durationPickerVisible ? (
          <DurationPickerBody
            initialHours={newDurationHours}
            onConfirm={confirmDuration}
            onCancel={closeDurationPicker}
          />
        ) : (
        <ScrollView
          style={[styles.createScroll, { maxHeight: height * 0.72 }]}
          contentContainerStyle={styles.createContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={styles.createSubtitle}>{t('notifications.createSubtitle')}</Text>

          {/* المستهدفون */}
          <View style={styles.labelRow}>
            <Text style={styles.createLabel}>{t('notifications.recipientLabel')}</Text>
            <Text style={styles.labelCounter}>
              {t('notifications.selectedCount', {
                count: newRecipients.length,
                total: recipientDirectory.length,
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  markAllText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  noticeText: {
    ...typography.caption,
    color: colors.success,
    flex: 1,
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
  tabsBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  directionTabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  directionTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  directionTabActive: {
    backgroundColor: colors.primaryLight,
  },
  directionTabText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  directionTabTextActive: {
    color: colors.textWhite,
  },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    ...typography.small,
    color: colors.textWhite,
    fontSize: 10,
    textAlign: 'center',
  },
  modalArchived: {
    ...typography.captionBold,
    color: colors.warning,
    marginBottom: spacing.xs,
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
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight,
  },
  senderBadgeText: {
    ...typography.captionBold,
    color: colors.primaryLight,
    fontSize: 10,
  },
  receiptsSection: {
    width: '100%',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiptsTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  receiptsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  receiptsLoadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  receiptsRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  receiptsRetryText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  receiptsEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  receiptBody: {
    flex: 1,
  },
  receiptName: {
    ...typography.bodySmall,
    color: colors.text,
    fontFamily: 'Cairo_700Bold',
  },
  receiptStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
  },
  receiptStatusRead: {
    color: colors.success,
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
