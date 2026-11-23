import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../../constants/typography';
import { spacing, borderRadius } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import { useLanguage } from '../../context/LanguageContext';
import { useCall, useCallAudio } from '../../context/CallContext';
import {
  PHASES,
  elapsedSeconds,
  endedReasonKey,
  otherParty,
} from '../../calls/callMachine';
import { SECURITY_CODE_STATUS, formatSecurityCode } from '../../calls/securityCode';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView, PulseRing } from '../../components/Motion';

// The call screen keeps its own dark palette in both themes, like the phone's
// own call screen, so it reads instantly as "you are in a call".
const CALL = {
  background: '#0b1b33',
  surface: 'rgba(255, 255, 255, 0.10)',
  surfaceStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#ffffff',
  textMuted: 'rgba(255, 255, 255, 0.72)',
  active: '#ffffff',
  activeIcon: '#0b1b33',
  end: '#e5484d',
  success: '#4ade80',
  danger: '#ff8a8a',
};

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/** A round call button with its label underneath. */
const RoundButton = ({ icon, label, onPress, active, disabled, variant, styles, accessibilityRole = 'button' }) => (
  <View style={styles.controlItem}>
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={accessibilityRole === 'switch' ? { checked: !!active, disabled } : { disabled }}
      style={({ pressed }) => [
        styles.roundButton,
        variant === 'end' && styles.endButton,
        active && styles.roundButtonActive,
        pressed && styles.roundButtonPressed,
        disabled && styles.roundButtonDisabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={variant === 'end' ? 30 : 26}
        color={active ? CALL.activeIcon : CALL.text}
        style={variant === 'end' ? styles.endIcon : null}
      />
    </Pressable>
    <Text style={styles.controlLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

/**
 * Speaker, mute and end. Mute and speaker read only the audio context, so a
 * tap re-renders these buttons and nothing else (not the call timer).
 */
const CallControls = React.memo(function CallControls({ styles, t, endLabel, onEnd, ending }) {
  const { muted, setMuted, speaker, setSpeaker, audioEnabled, speakerEnabled } = useCallAudio();
  return (
    <View style={styles.controlsRow}>
      <RoundButton
        styles={styles}
        icon="volume-high"
        label={t('callActive.speaker')}
        active={speaker}
        disabled={!speakerEnabled}
        onPress={() => setSpeaker((value) => !value)}
        accessibilityRole="switch"
      />
      <RoundButton
        styles={styles}
        icon={muted ? 'mic-off' : 'mic'}
        label={muted ? t('callActive.unmute') : t('callActive.mute')}
        active={muted}
        disabled={!audioEnabled}
        onPress={() => setMuted((value) => !value)}
        accessibilityRole="switch"
      />
      <RoundButton
        styles={styles}
        icon="call"
        variant="end"
        label={endLabel}
        disabled={ending}
        onPress={onEnd}
      />
    </View>
  );
});

/**
 * Outgoing, connecting, active and ended states of the live call. Rendered by
 * CallOverlay; everything comes from `useCall()` and the server's call view,
 * so a redacted leadership caller shows only the configured label.
 *
 * `onMinimize` shrinks the call into the bar at the top of the app, so the
 * user can keep using the app during the call (like WhatsApp).
 */
const CallActiveScreen = ({ onMinimize }) => {
  const { width } = useWindowDimensions();
  const { t, isRTL } = useLanguage();
  const { state, hangUp, audioEnabled, securityCode } = useCall();
  const styles = useMemo(() => flipStyles(createStyles(), isRTL), [isRTL]);

  const isSmallScreen = width < 375;

  const { phase, call, endedReason } = state;
  const party = otherParty(call) || {};
  const redacted = Boolean(call?.redacted);
  const person = { name: party.name, avatarUrl: redacted ? null : party.avatarUrl };

  // Re-render every second while the call is active.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== PHASES.ACTIVE) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const [hangingUp, setHangingUp] = useState(false);
  const handleHangUp = async () => {
    if (hangingUp) return;
    setHangingUp(true);
    try {
      await hangUp();
    } finally {
      setHangingUp(false);
    }
  };

  const duration = elapsedSeconds(call, now);
  const ended = phase === PHASES.ENDED;

  const statusText = ended
    ? t(endedReasonKey(endedReason))
    : phase === PHASES.OUTGOING
      ? t('callActive.outgoingRinging')
      : phase === PHASES.CONNECTING
        ? t('callActive.connecting')
        : formatDuration(duration);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* الشريط العلوي: تصغير المكالمة، وأنها مكالمة آمنة */}
      <View style={styles.topBar}>
        {!ended && onMinimize ? (
          <Pressable
            onPress={onMinimize}
            hitSlop={8}
            style={({ pressed }) => [styles.topButton, pressed && styles.roundButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('callActive.minimize')}
          >
            <Ionicons name="chevron-down" size={24} color={CALL.text} />
          </Pressable>
        ) : (
          <View style={styles.topButtonSpacer} />
        )}
        <View style={styles.secureBadge}>
          <Ionicons name="lock-closed" size={12} color={CALL.textMuted} />
          <Text style={styles.secureText}>{t('callActive.secureCall')}</Text>
        </View>
        <View style={styles.topButtonSpacer} />
      </View>

      {/* الطرف الآخر */}
      <View style={styles.center}>
        <PulseRing
          size={(isSmallScreen ? 64 : 96) + 12}
          active={phase === PHASES.OUTGOING || phase === PHASES.CONNECTING}
          style={styles.avatarPulse}
        >
          <View style={styles.avatarRing}>
            <UserAvatar person={person} size={isSmallScreen ? 'large' : 'xlarge'} />
          </View>
        </PulseRing>
        <Text style={styles.name} numberOfLines={2}>
          {localizeText(party.name || '')}
        </Text>
        {!redacted && party.unitName ? (
          <Text style={styles.unit} numberOfLines={1}>
            {localizeText(party.unitName)}
          </Text>
        ) : null}
        <Text
          style={[styles.status, phase === PHASES.ACTIVE && styles.statusTimer]}
          accessibilityLiveRegion="polite"
        >
          {statusText}
        </Text>
        {ended ? (
          <Text style={styles.unit}>
            {t('callActive.durationLabel')}
            {formatDuration(duration)}
          </Text>
        ) : null}

        {/* رمز الأمان: يقرؤه الطرفان لبعض؛ إن اختلف فهناك من يتنصّت */}
        {phase === PHASES.ACTIVE && audioEnabled && securityCode ? (
          securityCode.status === SECURITY_CODE_STATUS.READY ? (
            <View style={styles.securityBox}>
              <View style={styles.securityHeader}>
                <Ionicons name="key" size={14} color={CALL.success} />
                <Text style={styles.securityTitle}>{t('callActive.securityCodeTitle')}</Text>
              </View>
              <Text
                style={styles.securityCode}
                accessibilityLabel={securityCode.code.split('').join(' ')}
              >
                {formatSecurityCode(securityCode.code)}
              </Text>
              <Text style={styles.securityHint}>{t('callActive.securityCodeHint')}</Text>
            </View>
          ) : securityCode.status === SECURITY_CODE_STATUS.MISMATCH ? (
            <View style={[styles.securityBox, styles.securityBoxDanger]}>
              <View style={styles.securityHeader}>
                <Ionicons name="warning" size={16} color={CALL.danger} />
                <Text style={[styles.securityTitle, styles.securityTitleDanger]}>
                  {t('callActive.securityMismatchTitle')}
                </Text>
              </View>
              <Text style={styles.securityHint}>{t('callActive.securityMismatch')}</Text>
            </View>
          ) : (
            <View style={styles.securityBox}>
              <Text style={styles.securityHint}>{t('callActive.securityUnavailable')}</Text>
            </View>
          )
        ) : null}
      </View>

      {/* أزرار المكالمة */}
      {!ended ? (
        <FadeInView delay={120} distance={24} style={styles.bottom}>
          <CallControls
            styles={styles}
            t={t}
            endLabel={phase === PHASES.OUTGOING ? t('callActive.cancel') : t('callActive.endCall')}
            onEnd={handleHangUp}
            ending={hangingUp}
          />
        </FadeInView>
      ) : (
        <View style={styles.bottom} />
      )}
    </SafeAreaView>
  );
};

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALL.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALL.surface,
  },
  topButtonSpacer: {
    width: 44,
    height: 44,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: CALL.surface,
  },
  secureText: {
    ...typography.caption,
    color: CALL.textMuted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  avatarPulse: {
    marginBottom: spacing.lg,
  },
  avatarRing: {
    padding: 6,
    borderRadius: borderRadius.full,
    backgroundColor: CALL.surface,
  },
  name: {
    ...typography.h1,
    color: CALL.text,
    textAlign: 'center',
  },
  unit: {
    ...typography.bodySmall,
    color: CALL.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  status: {
    ...typography.body,
    color: CALL.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  statusTimer: {
    ...typography.h3,
    color: CALL.text,
    fontVariant: ['tabular-nums'],
  },
  securityBox: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: CALL.surface,
    alignItems: 'center',
  },
  securityBoxDanger: {
    backgroundColor: 'rgba(229, 72, 77, 0.22)',
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  securityTitle: {
    ...typography.bodySmallBold,
    color: CALL.text,
  },
  securityTitleDanger: {
    color: CALL.danger,
  },
  securityCode: {
    ...typography.h2,
    color: CALL.text,
    letterSpacing: 4,
    marginVertical: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  securityHint: {
    ...typography.caption,
    color: CALL.textMuted,
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    minHeight: 140,
    justifyContent: 'flex-end',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
  },
  controlItem: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 80,
  },
  roundButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALL.surfaceStrong,
  },
  roundButtonActive: {
    backgroundColor: CALL.active,
  },
  roundButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  roundButtonDisabled: {
    opacity: 0.4,
  },
  endButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CALL.end,
  },
  endIcon: {
    // The classic "hang up" handset.
    transform: [{ rotate: '135deg' }],
  },
  controlLabel: {
    ...typography.caption,
    color: CALL.textMuted,
    textAlign: 'center',
  },
});

export default CallActiveScreen;
