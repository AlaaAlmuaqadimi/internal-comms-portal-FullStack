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
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import NotificationItem from '../../components/NotificationItem';
import Modal from '../../components/Modal';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';

const NotificationsScreen = () => {
  const { width, height } = useWindowDimensions();
  const { t, align, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);
  
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
  const [newType, setNewType] = useState('إعلان');
  const [newRecipients, setNewRecipients] = useState([]);
  const [newBody, setNewBody] = useState('');
  const [newDuration, setNewDuration] = useState('1d');
  const [createErrors, setCreateErrors] = useState({});

  const durationOptions = [
    { key: '1h', label: t('notifications.duration1h') },
    { key: '4h', label: t('notifications.duration4h') },
    { key: '1d', label: t('notifications.duration1d') },
    { key: '7d', label: t('notifications.duration7d') },
  ];

  const typeOptions = [
    { key: 'إعلان', label: t('notifications.typeAnnouncement'), icon: 'megaphone' },
    { key: 'تعميم', label: t('notifications.typeCircular'), icon: 'calendar' },
    { key: 'مراسلة', label: t('notifications.typeMessage'), icon: 'mail' },
  ];

  const toggleRecipient = (id) => {
    setNewRecipients(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const resetCreateForm = () => {
    setNewType('إعلان');
    setNewRecipients([]);
    setNewBody('');
    setNewDuration('1d');
    setCreateErrors({});
  };

  const handleCreateNotification = () => {
    const errs = {};
    if (!newRecipients.length) errs.recipients = t('notifications.validationRecipient');
    if (!newBody.trim()) errs.body = t('notifications.validationBody');
    setCreateErrors(errs);
    if (Object.keys(errs).length) return;

    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours24 = now.getHours();
    const period = hours24 >= 12 ? 'م' : 'ص';
    const hours12 = hours24 % 12 || 12;
    const time = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${period}`;

    const typeOption = typeOptions.find(x => x.key === newType) || typeOptions[0];
    const durationLabel = durationOptions.find(x => x.key === newDuration)?.label;

    const notification = {
      id: `${Date.now()}`,
      type: newType,
      title: `${typeOption.label} · ${durationLabel}`,
      summary: newBody.trim().slice(0, 80),
      body: newBody.trim(),
      icon: typeOption.icon,
      date,
      time,
      unread: true,
    };

    setNotifications(prev => [notification, ...prev]);
    setCreateVisible(false);
    resetCreateForm();
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      setNotifications(mockData.notifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, []);

  const handleNotificationPress = (notification) => {
    setSelectedNotification(notification);
    setModalVisible(true);
    setNotifications(prev =>
      prev.map(n =>
        n.id === notification.id ? { ...n, unread: false } : n
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

  const getIconColor = (type) => {
    switch (type) {
      case 'إعلان':
        return colors.primaryLight;
      case 'تعميم':
        return colors.warning;
      case 'مراسلة':
        return colors.success;
      default:
        return colors.primaryLight;
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
        <View style={styles.headerActions}>
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
      {notifications.length === 0 ? (
        <EmptyState
          icon="notifications-off"
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyDescription')}
        />
      ) : (
        <FlatList
          data={notifications}
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
                  color={getIconColor(selectedNotification.type)}
                />
              </View>
              <Text style={[styles.modalType, isSmallScreen && styles.modalTypeSmall]}>
                {localizeText(selectedNotification.type)}
              </Text>
            </View>

            <Text style={[styles.modalTitle, isSmallScreen && styles.modalTitleSmall]}>
              {localizeText(selectedNotification.title)}
            </Text>
            <Text style={[styles.modalBody, { textAlign: align }, isSmallScreen && styles.modalBodySmall]}>
              {localizeText(selectedNotification.body)}
            </Text>

            <Text style={[styles.modalDate, isSmallScreen && styles.modalDateSmall]}>
              {selectedNotification.date} · {selectedNotification.time}
            </Text>
          </View>
        )}
      </Modal>

      {/* نافذة إنشاء إشعار */}
      <Modal
        visible={createVisible}
        onClose={() => { setCreateVisible(false); resetCreateForm(); }}
        title={t('notifications.createTitle')}
        size="large"
      >
        <ScrollView style={styles.createScroll} contentContainerStyle={styles.createContent}>
          <Text style={styles.createSubtitle}>{t('notifications.createSubtitle')}</Text>

          {/* نوع الإشعار */}
          <Text style={styles.createLabel}>{t('notifications.typeLabel')}</Text>
          <View style={styles.chipRow}>
            {typeOptions.map((opt) => {
              const active = newType === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setNewType(opt.key)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? colors.textWhite : colors.primaryLight}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* المستهدف */}
          <Text style={styles.createLabel}>{t('notifications.recipientLabel')}</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, newRecipients.includes('all') && styles.chipActive]}
              onPress={() => toggleRecipient('all')}
            >
              <Ionicons
                name="people"
                size={16}
                color={newRecipients.includes('all') ? colors.textWhite : colors.primaryLight}
              />
              <Text style={[styles.chipText, newRecipients.includes('all') && styles.chipTextActive]}>
                {t('notifications.recipientsAll')}
              </Text>
            </Pressable>
            {mockData.employees.map((emp) => {
              const active = newRecipients.includes(emp.id);
              return (
                <Pressable
                  key={emp.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleRecipient(emp.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {localizeText(emp.name)}
                  </Text>
                </Pressable>
              );
            })}
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
          />

          {/* مدة العرض */}
          <Text style={styles.createLabel}>{t('notifications.durationLabel')}</Text>
          <View style={styles.chipRow}>
            {durationOptions.map((opt) => {
              const active = newDuration === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setNewDuration(opt.key)}
                >
                  <Ionicons
                    name="time"
                    size={16}
                    color={active ? colors.textWhite : colors.primaryLight}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <CustomButton
            title={t('notifications.submit')}
            onPress={handleCreateNotification}
            icon="send"
            style={styles.createSubmit}
          />
        </ScrollView>
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
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f6f0e4',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerActions: {
    alignItems: 'flex-start',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    backgroundColor: '#eaf1f7',
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
