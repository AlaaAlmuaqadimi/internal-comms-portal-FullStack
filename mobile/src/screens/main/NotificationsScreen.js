import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
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
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';

const NotificationsScreen = () => {
  const { width, height } = useWindowDimensions();
  const { t, align } = useLanguage();
  
  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

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
        <View style={styles.badge}>
          <Text style={[styles.badgeText, isSmallScreen && styles.badgeTextSmall]}>
            {t('notifications.demoBadge')}
          </Text>
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

      {/* الفوتر */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, isSmallScreen && styles.footerTextSmall]}>
          {t('notifications.footer')}
        </Text>
      </View>
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
