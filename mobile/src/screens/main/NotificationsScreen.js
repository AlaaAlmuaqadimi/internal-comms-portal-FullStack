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
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import NotificationItem from '../../components/NotificationItem';
import Modal from '../../components/Modal';
import { mockData } from '../../utils/mockData';

const NotificationsScreen = () => {
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
    // تحديد كمقروء
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

  const renderNotification = ({ item }) => (
    <NotificationItem
      notification={item}
      onPress={() => handleNotificationPress(item)}
    />
  );

  if (loading) {
    return <Loading fullScreen text="جارٍ تحميل الإشعارات..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View>
            <Text style={styles.title}>الإشعارات</Text>
            <Text style={styles.subtitle}>
              تابع التعميمات والإعلانات والمراسلات الإدارية في مكان واحد.
            </Text>
          </View>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>بيانات تجريبية</Text>
        </View>
      </View>

      {/* قائمة الإشعارات */}
      {notifications.length === 0 ? (
        <EmptyState
          icon="notifications-off"
          title="لا توجد إشعارات"
          description="لا توجد إشعارات حالياً. ستظهر هنا التعميمات والإعلانات والمراسلات الإدارية."
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      {/* نافذة تفاصيل الإشعار */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="تفاصيل الإشعار"
        size="medium"
      >
        {selectedNotification && (
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: `${getIconColor(selectedNotification.type)}15` }]}>
                <Ionicons
                  name={getIconName(selectedNotification.icon)}
                  size={32}
                  color={getIconColor(selectedNotification.type)}
                />
              </View>
              <Text style={styles.modalType}>{selectedNotification.type}</Text>
            </View>

            <Text style={styles.modalTitle}>{selectedNotification.title}</Text>
            <Text style={styles.modalBody}>{selectedNotification.body}</Text>

            <Text style={styles.modalDate}>
              {selectedNotification.date} · {selectedNotification.time}
            </Text>
          </View>
        )}
      </Modal>

      {/* الفوتر */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          واجهة إشعارات داخلية · محتوى تجريبي للمعاينة
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
    padding: spacing.md,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f6f0e4',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    ...typography.captionBold,
    color: '#785e30',
  },
  listContent: {
    padding: spacing.md,
  },
  modalContent: {
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalType: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 28,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  modalDate: {
    ...typography.caption,
    color: colors.textLight,
  },
  footer: {
    padding: spacing.md,
    alignItems: 'center',
  },
  footerText: {
    ...typography.small,
    color: '#78889a',
  },
});

export default NotificationsScreen;
