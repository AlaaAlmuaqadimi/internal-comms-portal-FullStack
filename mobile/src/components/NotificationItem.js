import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { localizeText } from '../i18n/localize';
import { flipStyles } from '../i18n/rtlStyles';
import { notificationText } from '../utils/notificationText';

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

const ICONS = {
  alert: 'alert-circle',
  info: 'information-circle',
};

/**
 * One inbox row: icon, title, two lines of text and the time. Unread items get
 * a blue dot and a light tint instead of a heavy border.
 */
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

  const when = [notification.date, notification.time].filter(Boolean).join(' · ');
  // A one-line message is both title and summary on the server: show it once.
  const { heading, text } = notificationText(
    localizeText(notification.title),
    localizeText(notification.summary)
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isUnread }}
      style={({ pressed }) => [
        styles.container,
        isUnread && styles.unread,
        expired && styles.expiredCard,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.iconContainer, isUnread && styles.iconContainerUnread]}>
        <Ionicons
          name={ICONS[notification.icon] || 'megaphone'}
          size={20}
          color={isUnread ? colors.textWhite : colors.primaryLight}
        />
      </View>

      <View style={styles.textContainer}>
        <View style={styles.header}>
          <Text
            style={[styles.title, isUnread && styles.titleUnread]}
            numberOfLines={text ? 1 : 2}
          >
            {heading}
          </Text>
          {isUnread && <View style={styles.unreadDot} accessibilityLabel={t('common.unread')} />}
        </View>

        {!!text && (
          <Text style={styles.summary} numberOfLines={2}>
            {text}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.date} numberOfLines={1}>
            {when}
          </Text>
          {expired && (
            <View style={[styles.chip, styles.chipWarning]}>
              <Text style={[styles.chipText, styles.chipTextWarning]}>
                {t('notifications.expired')}
              </Text>
            </View>
          )}
          {notReadYet && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t('notifications.notReadYet')}</Text>
            </View>
          )}
        </View>

        {!!readSummaryText && (
          <View style={styles.readSummaryRow}>
            <Ionicons name="checkmark-done-outline" size={13} color={colors.success} />
            <Text numberOfLines={1} style={styles.readSummary}>
              {readSummaryText}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  unread: {
    backgroundColor: colors.selectedSurface,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  expiredCard: {
    opacity: 0.75,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  iconContainerUnread: {
    backgroundColor: colors.primaryLight,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text,
    flex: 1,
  },
  titleUnread: {
    ...typography.bodyBold,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primaryLight,
  },
  summary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  date: {
    ...typography.caption,
    color: colors.textLight,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
  },
  chipWarning: {
    backgroundColor: colors.warningLight,
  },
  chipText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  chipTextWarning: {
    color: colors.warning,
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
});

export default NotificationItem;
