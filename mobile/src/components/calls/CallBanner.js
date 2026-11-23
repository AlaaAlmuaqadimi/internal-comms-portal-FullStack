import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../AppText';
import { useCall } from '../../context/CallContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
  PHASES,
  elapsedSeconds,
  endedReasonKey,
  otherParty,
} from '../../calls/callMachine';
import { localizeText } from '../../i18n/localize';
import { typography } from '../../constants/typography';
import { spacing, borderRadius } from '../../constants/spacing';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView } from '../Motion';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/** True while the minimized call bar is on screen. */
export function useCallBannerVisible() {
  const { state, minimized } = useCall();
  return minimized && state.phase !== PHASES.IDLE && state.phase !== PHASES.INCOMING;
}

/**
 * Wraps the screens under the call bar. While the bar shows, it already covers
 * the status bar, so the screens get a top inset of 0 (no empty gap under the
 * bar). The provider is always rendered, so showing or hiding the bar never
 * remounts the navigator (the open tab and its scroll position are kept).
 */
export const CallBannerInsets = ({ children }) => {
  const visible = useCallBannerVisible();
  const insets = useSafeAreaInsets();
  const value = useMemo(() => (visible ? { ...insets, top: 0 } : insets), [visible, insets]);
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
};

/**
 * The minimized call: a green bar at the top of the app (like WhatsApp) with
 * the other person, the timer and a hang-up button. Tapping it reopens the
 * full call screen. It sits above the navigator, so it pushes the screens
 * down instead of covering them.
 */
const CallBanner = () => {
  const { state, minimized, setMinimized, hangUp } = useCall();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => flipStyles(createStyles(colors), isRTL), [colors, isRTL]);

  const { phase, call, endedReason } = state;
  const shown = useCallBannerVisible();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!shown || phase !== PHASES.ACTIVE) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shown, phase]);

  if (!shown) return null;

  const ended = phase === PHASES.ENDED;
  const party = otherParty(call) || {};
  const status = ended
    ? t(endedReasonKey(endedReason))
    : phase === PHASES.ACTIVE
      ? formatDuration(elapsedSeconds(call, now))
      : phase === PHASES.OUTGOING
        ? t('callActive.outgoingRinging')
        : t('callActive.connecting');
  const background = ended ? colors.danger : colors.success;

  return (
    <FadeInView
      from="top"
      distance={28}
      duration={220}
      style={[styles.banner, { backgroundColor: background, paddingTop: insets.top + 6 }]}
    >
      <StatusBar style="light" backgroundColor={background} />
      <Pressable
        onPress={() => setMinimized(false)}
        disabled={ended}
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={`${t('callActive.returnToCall')}, ${localizeText(party.name || '')}`}
      >
        <View style={styles.icon}>
          <Ionicons name={ended ? 'call-outline' : 'call'} size={15} color="#ffffff" />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {ended ? status : t('callActive.returnToCall')}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {localizeText(party.name || '')}
            {ended ? '' : ` · ${status}`}
          </Text>
        </View>
      </Pressable>
      {!ended && (
        <Pressable
          onPress={() => {
            Promise.resolve(hangUp()).catch(() => {});
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('callActive.endCall')}
        >
          <Ionicons name="call" size={16} color="#ffffff" style={styles.endIcon} />
        </Pressable>
      )}
    </FadeInView>
  );
};

const createStyles = () =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    icon: {
      width: 30,
      height: 30,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    texts: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...typography.bodySmallBold,
      color: '#ffffff',
    },
    subtitle: {
      ...typography.caption,
      color: 'rgba(255, 255, 255, 0.88)',
      fontVariant: ['tabular-nums'],
    },
    endButton: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#e5484d',
    },
    endButtonPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.94 }],
    },
    endIcon: {
      transform: [{ rotate: '135deg' }],
    },
  });

export default CallBanner;
