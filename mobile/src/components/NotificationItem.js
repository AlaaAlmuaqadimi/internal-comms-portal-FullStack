import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { localizeText } from '../i18n/localize';
import { flipStyles } from '../i18n/rtlStyles';

const NotificationItem = ({
  notification,
  onPress,
  style,
}) => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );
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
    switch (notification.typeKey || notification.type) {
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

  const typeLabel = notification.typeKey
    ? t(`notifications.type${notification.typeKey.charAt(0).toUpperCase()}${notification.typeKey.slice(1)}`)
    : localizeText(notification.type);

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
            <Text style={styles.type}>{typeLabel}</Text>
            <View style={styles.status}>
              {notification.isSender && (
                <View style={styles.senderBadge}>
                  <Ionicons name="send" size={10} color={colors.primaryLight} />
                  <Text style={styles.senderText}>
                    {t('notifications.senderBadge')}
                  </Text>
                </View>
              )}
              {notification.unread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{t('common.unread')}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.title}>{localizeText(notification.title)}</Text>
          <Text style={styles.summary} numberOfLines={2}>{localizeText(notification.summary)}</Text>
          <View style={styles.footerRow}>
            <Text style={styles.date}>{notification.date} · {notification.time}</Text>
            {notification.isSender && !!notification.recipientCount && (
              <Text style={styles.readSummary}>
                {t('notifications.readSummary', {
                  read: notification.readCount || 0,
                  total: notification.recipientCount,
                })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const createStyles = (colors) => StyleSheet.create({
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
  gap: spacing.md,
  padding: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.xs,
    flexShrink: 0,
  },
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight,
  },
  senderText: {
    ...typography.caption,
    color: colors.primaryLight,
    fontSize: 9,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  readSummary: {
    ...typography.caption,
    color: colors.success,
    fontSize: 10,
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
