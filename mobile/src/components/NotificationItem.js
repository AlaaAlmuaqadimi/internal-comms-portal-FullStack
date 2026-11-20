import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { localizeText } from '../i18n/localize';
import { flipStyles } from '../i18n/rtlStyles';

// Compact time for the sender's "last read" line; the details window has the
// full receipt list.
const formatReadTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const NotificationItem = ({
  notification,
  onPress,
  style,
  // The sender's Outgoing tab keeps expired items as an archive.
  expired = false,
}) => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSender = !!notification.isSender;
  // A sender's own copy is never an unread inbox item.
  const isUnread = !isSender && !!notification.unread;

  // Read receipts are for the sender only; recipients never see them.
  const readCount = Number(notification.readCount || 0);
  const recipientCount = Number(notification.recipientCount || 0);
  const notReadYet = isSender && readCount === 0;
  const readSummaryText = useMemo(() => {
    if (!isSender || readCount === 0) return '';
    const total = recipientCount || readCount;
    const time = formatReadTime(notification.lastReadAt);
    return time
      ? t('notifications.receiptsInline', { read: readCount, total, time })
      : t('notifications.receiptsInlineNoTime', { read: readCount, total });
  }, [isSender, readCount, recipientCount, notification.lastReadAt, t]);

  const getIconName = () => {
    switch (notification.icon) {
      case 'alert':
        return 'alert-circle';
      case 'info':
        return 'information-circle';
      default:
        return 'megaphone';
    }
  };

  const iconColor = colors.primaryLight;

  // Only announcements exist; older items of the removed types are shown as
  // announcements too.
  const typeLabel = t('notifications.typeAnnouncement');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        isUnread && styles.unread,
        expired && styles.expiredCard,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={getIconName()} size={24} color={iconColor} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.header}>
            <Text style={styles.type}>{typeLabel}</Text>
            <View style={styles.status}>
              {expired && (
                <View style={styles.expiredBadge}>
                  <Text style={styles.expiredText}>
                    {t('notifications.expired')}
                  </Text>
                </View>
              )}
              {isUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{t('common.unread')}</Text>
                </View>
              )}
              {notReadYet && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {t('notifications.notReadYet')}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.title}>{localizeText(notification.title)}</Text>
          <Text style={styles.summary} numberOfLines={2}>{localizeText(notification.summary)}</Text>
          <Text style={styles.date}>{notification.date} · {notification.time}</Text>
          {!!readSummaryText && (
            <View style={styles.readSummaryRow}>
              <Ionicons
                name="checkmark-done-outline"
                size={13}
                color={colors.success}
              />
              <Text numberOfLines={1} style={styles.readSummary}>
                {readSummaryText}
              </Text>
            </View>
          )}
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
  expiredCard: {
    opacity: 0.85,
  },
  expiredBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warningLight,
  },
  expiredText: {
    ...typography.caption,
    color: colors.warning,
    fontSize: 10,
  },
  readSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  readSummary: {
    ...typography.caption,
    color: colors.success,
    flex: 1,
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
