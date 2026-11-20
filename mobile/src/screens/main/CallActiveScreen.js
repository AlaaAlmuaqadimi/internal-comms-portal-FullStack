import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';
import {
  PHASES,
  elapsedSeconds,
  endedReasonKey,
  otherParty,
} from '../../calls/callMachine';
import { SECURITY_CODE_STATUS, formatSecurityCode } from '../../calls/securityCode';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Outgoing, connecting, active and ended states of the live call. Rendered by
 * CallOverlay; everything comes from `useCall()` and the server's call view,
 * so a redacted leadership caller shows only the configured label.
 */
const CallActiveScreen = () => {
  const { width, height } = useWindowDimensions();
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const {
    state,
    hangUp,
    muted,
    setMuted,
    speaker,
    setSpeaker,
    audioEnabled,
    speakerEnabled,
    securityCode,
  } = useCall();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;

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

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'medium' : isLargeScreen ? 'xlarge' : 'large';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const controlIconSize = isSmallScreen ? 20 : isLargeScreen ? 28 : 24;

  if (phase === PHASES.ENDED) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.summaryContainer, { padding: cardPadding }]}>
          <View style={styles.summaryIcon}>
            <Ionicons name="call" size={isSmallScreen ? 24 : 32} color={colors.primaryLight} />
          </View>
          <Text style={[styles.summaryTitle, isSmallScreen && styles.summaryTitleSmall]}>
            {t(endedReasonKey(endedReason))}
          </Text>

          <View style={styles.summaryDetails}>
            <Text style={[styles.summaryText, isSmallScreen && styles.summaryTextSmall]}>
              <Text style={styles.summaryLabel}>{t('callActive.employeeLabel')}</Text>
              {localizeText(party.name || '')}
            </Text>
            {duration > 0 ? (
              <Text style={[styles.summaryText, isSmallScreen && styles.summaryTextSmall]}>
                <Text style={styles.summaryLabel}>{t('callActive.durationLabel')}</Text>
                {formatDuration(duration)}
              </Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const statusText =
    phase === PHASES.OUTGOING
      ? t('callActive.outgoingRinging')
      : phase === PHASES.CONNECTING
      ? t('callActive.connecting')
      : formatDuration(duration);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[
        styles.scrollContent,
        isLandscape && styles.scrollContentLandscape,
      ]}>
        {/* معلومات المكالمة */}
        <View style={[styles.callInfo, { padding: cardPadding }]}>
          <View style={styles.callHeader}>
            <UserAvatar person={person} size={avatarSize} />
            <View style={styles.callHeaderText}>
              <Text style={[styles.callLabel, isSmallScreen && styles.callLabelSmall]}>
                {phase === PHASES.ACTIVE ? t('callActive.inCall') : t('callActive.callingEmployee')}
              </Text>
              <Text style={[styles.callName, isSmallScreen && styles.callNameSmall]}>
                {localizeText(party.name || '')}
              </Text>
              {!redacted && party.unitName ? (
                <Text style={[styles.callUnit, isSmallScreen && styles.callUnitSmall]}>
                  {localizeText(party.unitName)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.callMeta}>
            <View style={styles.durationContainer}>
              <Text style={[styles.durationLabel, isSmallScreen && styles.durationLabelSmall]}>
                {t('callActive.durationTitle')}
              </Text>
              <Text style={[styles.duration, isSmallScreen && styles.durationSmall]}>
                {statusText}
              </Text>
            </View>
            <View style={styles.secureBadge}>
              <Ionicons name="shield" size={isSmallScreen ? 14 : 16} color={colors.primaryLight} />
              <Text style={[styles.secureText, isSmallScreen && styles.secureTextSmall]}>
                {t('callActive.secureCall')}
              </Text>
            </View>
          </View>

          {/* رمز الأمان: يقرؤه الطرفان لبعض؛ إن اختلف فهناك من يتنصّت */}
          {phase === PHASES.ACTIVE && audioEnabled && securityCode ? (
            securityCode.status === SECURITY_CODE_STATUS.READY ? (
              <View style={styles.securityBox}>
                <View style={styles.securityHeader}>
                  <Ionicons name="key" size={isSmallScreen ? 14 : 16} color={colors.success} />
                  <Text style={[styles.securityTitle, isSmallScreen && styles.securityTitleSmall]}>
                    {t('callActive.securityCodeTitle')}
                  </Text>
                </View>
                <Text
                  style={[styles.securityCode, isSmallScreen && styles.securityCodeSmall]}
                  accessibilityLabel={securityCode.code.split('').join(' ')}
                >
                  {formatSecurityCode(securityCode.code)}
                </Text>
                <Text style={[styles.securityHint, isSmallScreen && styles.securityHintSmall]}>
                  {t('callActive.securityCodeHint')}
                </Text>
              </View>
            ) : securityCode.status === SECURITY_CODE_STATUS.MISMATCH ? (
              <View style={[styles.securityBox, styles.securityBoxDanger]}>
                <View style={styles.securityHeader}>
                  <Ionicons name="warning" size={isSmallScreen ? 16 : 18} color={colors.danger} />
                  <Text style={[styles.securityTitle, styles.securityTitleDanger]}>
                    {t('callActive.securityMismatchTitle')}
                  </Text>
                </View>
                <Text style={[styles.securityHint, styles.securityHintDanger]}>
                  {t('callActive.securityMismatch')}
                </Text>
              </View>
            ) : (
              <View style={[styles.securityBox, styles.securityBoxMuted]}>
                <Text style={[styles.securityHint, isSmallScreen && styles.securityHintSmall]}>
                  {t('callActive.securityUnavailable')}
                </Text>
              </View>
            )
          ) : null}
        </View>

        {/* التحكم بالمكالمة */}
        <View style={[styles.controls, { padding: cardPadding }]}>
          <Text style={[styles.controlsTitle, isSmallScreen && styles.controlsTitleSmall]}>
            {t('callActive.controlsTitle')}
          </Text>

          <View style={styles.controlsGrid}>
            <Pressable
              style={[styles.controlButton, muted && styles.controlButtonActive]}
              onPress={() => setMuted(!muted)}
              disabled={!audioEnabled}
            >
              <Ionicons
                name={muted ? 'mic-off' : 'mic'}
                size={controlIconSize}
                color={muted ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, muted && styles.controlLabelActive, isSmallScreen && styles.controlLabelSmall]}>
                {muted ? t('callActive.unmute') : t('callActive.mute')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.controlButton, speaker && styles.controlButtonActive]}
              onPress={() => setSpeaker(!speaker)}
              disabled={!speakerEnabled}
            >
              <Ionicons
                name="volume-high"
                size={controlIconSize}
                color={speaker ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, speaker && styles.controlLabelActive, isSmallScreen && styles.controlLabelSmall]}>
                {speaker ? t('callActive.speakerOff') : t('callActive.speaker')}
              </Text>
            </Pressable>
          </View>

          {/* زر إنهاء أو إلغاء المكالمة */}
          <View style={styles.endCallContainer}>
            <Pressable
              style={[styles.endCallButton, hangingUp && { opacity: 0.6 }]}
              onPress={handleHangUp}
              disabled={hangingUp}
            >
              <Ionicons name="call" size={isSmallScreen ? 20 : 24} color={colors.textWhite} />
              <Text style={[styles.endCallText, isSmallScreen && styles.endCallTextSmall]}>
                {phase === PHASES.OUTGOING ? t('callActive.cancel') : t('callActive.endCall')}
              </Text>
            </Pressable>
          </View>
        </View>

        {!audioEnabled ? (
          <Text style={[styles.disclaimer, isSmallScreen && styles.disclaimerSmall]}>
            {t('callActive.disclaimer')}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
  callInfo: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.md,
    ...shadows.sm,
  },
  callHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  callHeaderText: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  callLabel: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  callLabelSmall: {
    fontSize: 11,
  },
  callName: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.xs,
  },
  callNameSmall: {
    fontSize: 18,
  },
  callUnit: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  callUnitSmall: {
    fontSize: 12,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  durationContainer: {
    alignItems: 'center',
  },
  durationLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  durationLabelSmall: {
    fontSize: 10,
  },
  duration: {
    ...typography.h1,
    color: colors.text,
    marginTop: spacing.xs,
  },
  durationSmall: {
    fontSize: 24,
  },
  secureBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs,
  },
  secureText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  secureTextSmall: {
    fontSize: 10,
  },
  securityBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successLight,
    alignItems: 'center',
  },
  securityBoxDanger: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerLight,
  },
  securityBoxMuted: {
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  securityTitle: {
    ...typography.captionBold,
    color: colors.success,
  },
  securityTitleSmall: {
    fontSize: 11,
  },
  securityTitleDanger: {
    color: colors.danger,
  },
  securityCode: {
    ...typography.h1,
    color: colors.text,
    letterSpacing: 4,
    marginTop: spacing.xs,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  securityCodeSmall: {
    fontSize: 24,
  },
  securityHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  securityHintSmall: {
    fontSize: 10,
  },
  securityHintDanger: {
    color: colors.danger,
  },
  controls: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.md,
    ...shadows.sm,
  },
  controlsTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  controlsTitleSmall: {
    fontSize: 16,
  },
  controlsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  controlLabel: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  controlLabelSmall: {
    fontSize: 10,
  },
  controlLabelActive: {
    color: colors.textWhite,
  },
  endCallContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  endCallButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  backgroundColor: colors.danger,
  borderRadius: borderRadius.md,
  paddingHorizontal: spacing.xl,
  paddingVertical: spacing.sm,
},
endCallText: {
  ...typography.button,
  color: colors.textWhite,
},
  endCallTextSmall: {
    fontSize: 13,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    margin: spacing.md,
  },
  disclaimerSmall: {
    fontSize: 10,
  },
  summaryContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eaf1f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  summaryTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryTitleSmall: {
    fontSize: 18,
  },
  summaryDetails: {
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryText: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  summaryTextSmall: {
    fontSize: 12,
  },
  summaryLabel: {
    fontFamily: 'Cairo_700Bold',
    color: colors.textSecondary,
  },
});

export default CallActiveScreen;


