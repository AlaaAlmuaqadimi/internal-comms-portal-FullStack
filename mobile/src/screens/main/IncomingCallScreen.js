import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import { otherParty } from '../../calls/callMachine';
import { typography } from '../../constants/typography';
import { spacing } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import { PulseRing } from '../../components/Motion';
import { localizeText } from '../../i18n/localize';

/**
 * Full-screen incoming call, shown by CallOverlay from anywhere in the app.
 *
 * Renders only the server's call view. For a redacted leadership caller that
 * is just the configured label (e.g. «المدير العام»): no avatar, no unit.
 */
const IncomingCallScreen = () => {
  const { width } = useWindowDimensions();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const { state, accept, reject } = useCall();
  const [busy, setBusy] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const call = state.call;
  const caller = otherParty(call) || {};
  const redacted = Boolean(call?.redacted);
  const isSmall = width < 375;

  const run = (action) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <Text style={styles.title}>{t('callActive.incomingTitle')}</Text>
        <PulseRing size={(isSmall ? 64 : 96) + 12} active>
          <View style={styles.avatarRing}>
            <UserAvatar
              person={{ name: caller.name, avatarUrl: redacted ? null : caller.avatarUrl }}
              size={isSmall ? 'large' : 'xlarge'}
            />
          </View>
        </PulseRing>
        <Text style={[styles.name, isSmall && styles.nameSmall]}>
          {localizeText(caller.name || '')}
        </Text>
        {!redacted && caller.unitName ? (
          <Text style={styles.unit}>{localizeText(caller.unitName)}</Text>
        ) : null}
      </View>

      {/* Decline at the start, answer at the end: mirrored in Arabic. */}
      <View style={[styles.actions, isRTL && styles.actionsRtl]}>
        <View style={styles.action}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('callActive.reject')}
            style={[styles.round, styles.reject, busy && styles.disabled]}
            onPress={run(reject)}
            disabled={busy}
          >
            <Ionicons name="call" size={30} color={colors.textWhite} style={styles.hangIcon} />
          </Pressable>
          <Text style={styles.actionLabel}>{t('callActive.reject')}</Text>
        </View>

        <View style={styles.action}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('callActive.accept')}
            style={[styles.round, styles.accept, busy && styles.disabled]}
            onPress={run(accept)}
            disabled={busy}
          >
            <Ionicons name="call" size={30} color={colors.textWhite} />
          </Pressable>
          <Text style={styles.actionLabel}>{t('callActive.accept')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      // Same dark call palette as CallActiveScreen, in both themes.
      backgroundColor: '#0b1b33',
      justifyContent: 'space-between',
    },
    avatarRing: {
      padding: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
    },
    top: {
      alignItems: 'center',
      paddingTop: spacing.xl * 2,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    title: {
      ...typography.body,
      color: colors.textWhite,
      opacity: 0.8,
      marginBottom: spacing.md,
    },
    name: {
      ...typography.h1,
      color: colors.textWhite,
      textAlign: 'center',
    },
    nameSmall: {
      fontSize: 22,
    },
    unit: {
      ...typography.body,
      color: colors.textWhite,
      opacity: 0.75,
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingBottom: spacing.xl * 2,
    },
    actionsRtl: {
      flexDirection: 'row-reverse',
    },
    action: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    round: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accept: {
      backgroundColor: colors.success,
    },
    reject: {
      backgroundColor: colors.danger,
    },
    disabled: {
      opacity: 0.5,
    },
    hangIcon: {
      transform: [{ rotate: '135deg' }],
    },
    actionLabel: {
      ...typography.bodySmall,
      color: colors.textWhite,
    },
  });

export default IncomingCallScreen;
