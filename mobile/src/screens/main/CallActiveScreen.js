import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import StatusBadge from '../../components/StatusBadge';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';

const CallActiveScreen = ({ route, navigation }) => {
  const { width, height } = useWindowDimensions();
  const { contact } = route.params;
  const { t, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);
  
  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const timerRef = useRef(null);
  const endTimeoutRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setCallEnded(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    // العودة تلقائياً لواجهة المكالمات بعد عرض ملخص المكالمة
    endTimeoutRef.current = setTimeout(() => {
      navigation.navigate('Calls');
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    };
  }, []);

  // أحجام متجاوبة
  const avatarSize = isSmallScreen ? 'medium' : isLargeScreen ? 'xlarge' : 'large';
  const cardPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const controlIconSize = isSmallScreen ? 20 : isLargeScreen ? 28 : 24;

  if (callEnded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.summaryContainer, { padding: cardPadding }]}>
          <View style={styles.summaryIcon}>
            <Ionicons name="call" size={isSmallScreen ? 24 : 32} color={colors.primaryLight} />
          </View>
          <Text style={[styles.summaryTitle, isSmallScreen && styles.summaryTitleSmall]}>
            {t('callActive.ended')}
          </Text>

          <View style={styles.summaryDetails}>
            <Text style={[styles.summaryText, isSmallScreen && styles.summaryTextSmall]}>
              <Text style={styles.summaryLabel}>{t('callActive.employeeLabel')}</Text>
              {localizeText(contact.name)}
            </Text>
            <Text style={[styles.summaryText, isSmallScreen && styles.summaryTextSmall]}>
              <Text style={styles.summaryLabel}>{t('callActive.durationLabel')}</Text>
              {formatDuration(duration)}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[
        styles.scrollContent,
        isLandscape && styles.scrollContentLandscape,
      ]}>
        {/* معلومات المكالمة */}
        <View style={[styles.callInfo, { padding: cardPadding }]}>
          <View style={styles.callHeader}>
            <UserAvatar person={contact} size={avatarSize} />
            <View style={styles.callHeaderText}>
              <Text style={[styles.callLabel, isSmallScreen && styles.callLabelSmall]}>
                {contact.isKitchen ? t('callActive.communicatingWith') : t('callActive.callingEmployee')}
              </Text>
              <Text style={[styles.callName, isSmallScreen && styles.callNameSmall]}>
                {localizeText(contact.name)}
              </Text>
              <Text style={[styles.callUnit, isSmallScreen && styles.callUnitSmall]}>
                {localizeText(contact.unitName)}
              </Text>
            </View>
            <StatusBadge
              status={contact.isKitchen ? 'kitchen' : 'online'}
              text={contact.isKitchen ? t('callActive.serviceAvailable') : t('callActive.onlineNow')}
            />
          </View>

          <View style={styles.callMeta}>
            <View style={styles.durationContainer}>
              <Text style={[styles.durationLabel, isSmallScreen && styles.durationLabelSmall]}>
                {t('callActive.durationTitle')}
              </Text>
              <Text style={[styles.duration, isSmallScreen && styles.durationSmall]}>
                {formatDuration(duration)}
              </Text>
            </View>
            <View style={styles.secureBadge}>
              <Ionicons name="shield" size={isSmallScreen ? 14 : 16} color={colors.primaryLight} />
              <Text style={[styles.secureText, isSmallScreen && styles.secureTextSmall]}>
                {t('callActive.secureCall')}
              </Text>
            </View>
          </View>
        </View>

        {/* التحكم بالمكالمة */}
        <View style={[styles.controls, { padding: cardPadding }]}>
          <Text style={[styles.controlsTitle, isSmallScreen && styles.controlsTitleSmall]}>
            {t('callActive.controlsTitle')}
          </Text>

          <View style={styles.controlsGrid}>
            <Pressable
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={controlIconSize}
                color={isMuted ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive, isSmallScreen && styles.controlLabelSmall]}>
                {isMuted ? t('callActive.unmute') : t('callActive.mute')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons
                name="volume-high"
                size={controlIconSize}
                color={isSpeaker ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, isSpeaker && styles.controlLabelActive, isSmallScreen && styles.controlLabelSmall]}>
                {isSpeaker ? t('callActive.speakerOff') : t('callActive.speaker')}
              </Text>
            </Pressable>
          </View>

          {/* زر إنهاء المكالمة */}
          <View style={styles.endCallContainer}>
            <Pressable style={styles.endCallButton} onPress={handleEndCall}>
              <Ionicons name="call" size={isSmallScreen ? 20 : 24} color={colors.textWhite} />
              <Text style={[styles.endCallText, isSmallScreen && styles.endCallTextSmall]}>
                {t('callActive.endCall')}
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.disclaimer, isSmallScreen && styles.disclaimerSmall]}>
          {t('callActive.disclaimer')}
        </Text>
      </ScrollView>

    </SafeAreaView>
  );
};

const rawStyles = StyleSheet.create({
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


