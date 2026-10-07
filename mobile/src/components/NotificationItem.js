import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { localizeText } from '../i18n/localize';

const NotificationItem = ({
  notification,
  onPress,
  style,
}) => {
  const { t } = useLanguage();
  const getIconName = () => {
    switch (notification.icon) {
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

  const getIconColor = () => {
    switch (notification.type) {
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        notification.unread && styles.unread,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: `${getIconColor()}15` }]}>
          <Ionicons name={getIconName()} size={24} color={getIconColor()} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.header}>
            <Text style={styles.type}>{localizeText(notification.type)}</Text>
            <View style={styles.status}>
              {notification.unread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{t('common.unread')}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.title}>{localizeText(notification.title)}</Text>
          <Text style={styles.summary} numberOfLines={2}>{localizeText(notification.summary)}</Text>
          <Text style={styles.date}>{notification.date} · {notification.time}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  unread: {
    borderColor: colors.primaryLight,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  type: {
    ...typography.bodySmallBold,
    color: colors.primaryLight,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadText: {
    ...typography.caption,
    color: colors.primaryLight,
    marginLeft: 4,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  summary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  date: {
    ...typography.caption,
    color: colors.textLight,
  },
});

export default NotificationItem;
