import React, { useState, useEffect, useRef } from 'react';
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
import CustomButton from '../../components/CustomButton';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';

const CallActiveScreen = ({ route, navigation }) => {
  const { width, height } = useWindowDimensions();
  const { contact } = route.params;
  const { t, isRTL } = useLanguage();
  
  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadInput, setKeypadInput] = useState('');
  const [showEndModal, setShowEndModal] = useState(false);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const timerRef = useRef(null);

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
    setShowEndModal(true);
  };

  const confirmEndCall = () => {
    setShowEndModal(false);
    setCallEnded(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const handleKeypadPress = (digit) => {
    if (keypadInput.length < 24) {
      setKeypadInput(prev => prev + digit);
    }
  };

  const handleKeypadClear = () => {
    setKeypadInput('');
  };

  const handleAddParticipant = (participant) => {
    setSelectedParticipant(participant);
    setShowParticipantModal(false);
  };

  const handleRestart = () => {
    setDuration(0);
    setCallEnded(false);
    setIsMuted(false);
    setIsSpeaker(false);
    setShowKeypad(false);
    setKeypadInput('');
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const participants = [
    { id: '1', name: 'أحمد محمد العلي' },
    { id: '2', name: 'فاطمة عبدالله السعيد' },
    { id: '3', name: 'خالد إبراهيم الحربي' },
  ];

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

          <View style={styles.summaryActions}>
            <CustomButton
              title={t('callActive.backToDirectory')}
              onPress={() => navigation.navigate('Directory')}
              style={styles.summaryButton}
              size="small"
            />
            <CustomButton
              title={t('callActive.recentCalls')}
              onPress={() => navigation.navigate('Calls')}
              variant="outline"
              style={styles.summaryButton}
              size="small"
            />
            <CustomButton
              title={t('callActive.callAgain')}
              onPress={handleRestart}
              variant="outline"
              style={styles.summaryButton}
              size="small"
            />
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

            <Pressable
              style={[styles.controlButton, showKeypad && styles.controlButtonActive]}
              onPress={() => setShowKeypad(!showKeypad)}
            >
              <Ionicons
                name="grid"
                size={controlIconSize}
                color={showKeypad ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, showKeypad && styles.controlLabelActive, isSmallScreen && styles.controlLabelSmall]}>
                {t('callActive.keypad')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={() => setShowParticipantModal(true)}
            >
              <Ionicons name="person-add" size={controlIconSize} color={colors.text} />
              <Text style={[styles.controlLabel, isSmallScreen && styles.controlLabelSmall]}>
                {t('callActive.addParticipant')}
              </Text>
            </Pressable>
          </View>

          {/* لوحة الأرقام */}
          {showKeypad && (
            <View style={styles.keypad}>
              <View style={styles.keypadHeader}>
                <Text style={[styles.keypadTitle, isSmallScreen && styles.keypadTitleSmall]}>
                  {t('callActive.keypadTitle')}
                </Text>
                <Pressable onPress={() => setShowKeypad(false)} style={styles.keypadClose}>
                  <Text style={styles.keypadCloseText}>{t('common.close')}</Text>
                </Pressable>
              </View>

              <Text style={[styles.keypadInput, isSmallScreen && styles.keypadInputSmall]}>
                {keypadInput || t('callActive.enteredDigits')}
              </Text>

              <View style={styles.keypadGrid}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                  <Pressable
                    key={digit}
                    style={styles.keypadButton}
                    onPress={() => handleKeypadPress(digit)}
                  >
                    <Text style={styles.keypadButtonText}>{digit}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={handleKeypadClear} style={styles.keypadClear}>
                <Text style={styles.keypadClearText}>{t('callActive.clearDigits')}</Text>
              </Pressable>
            </View>
          )}

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

      {/* نافذة إضافة مشارك */}
      <Modal
        visible={showParticipantModal}
        onClose={() => setShowParticipantModal(false)}
        title={t('callActive.addParticipantTitle')}
        size="medium"
      >
        <Text style={styles.modalDescription}>
          {t('callActive.addParticipantDescription')}
        </Text>

        <View style={styles.participantsList}>
          {participants.map((participant) => (
            <Pressable
              key={participant.id}
              style={styles.participantItem}
              onPress={() => handleAddParticipant(participant)}
            >
              <Text style={styles.participantName}>{localizeText(participant.name)}</Text>
            </Pressable>
          ))}
        </View>

        {selectedParticipant && (
          <Text style={styles.selectedParticipant}>
            {t('callActive.selectedParticipant', { name: localizeText(selectedParticipant.name) })}
          </Text>
        )}
      </Modal>

      {/* نافذة تأكيد إنهاء المكالمة */}
      <ConfirmDialog
        visible={showEndModal}
        onClose={() => setShowEndModal(false)}
        onConfirm={confirmEndCall}
        title={t('callActive.confirmEndTitle')}
        description={t('callActive.confirmEndDescription')}
        confirmText={t('callActive.confirmEnd')}
        cancelText={t('callActive.continueCall')}
        variant="danger"
        icon="call"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  },
  secureText: {
    ...typography.captionBold,
    color: colors.primaryLight,
    marginRight: spacing.xs,
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
  keypad: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  keypadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  keypadTitle: {
    ...typography.h4,
    color: colors.text,
  },
  keypadTitleSmall: {
    fontSize: 14,
  },
  keypadClose: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  keypadCloseText: {
    ...typography.captionBold,
    color: colors.text,
  },
  keypadInput: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    minHeight: 36,
  },
  keypadInputSmall: {
    fontSize: 20,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  keypadButton: {
    width: '30%',
    aspectRatio: 1.5,
    backgroundColor: '#edf3f8',
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonText: {
    ...typography.h3,
    color: colors.text,
  },
  keypadClear: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: 'center',
  },
  keypadClearText: {
    ...typography.bodySmallBold,
    color: colors.primaryLight,
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
    backgroundColor: colors.danger,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  endCallText: {
    ...typography.button,
    color: colors.textWhite,
    marginRight: spacing.sm,
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
    fontWeight: '700',
    color: colors.textSecondary,
  },
  summaryActions: {
    width: '100%',
    gap: spacing.sm,
  },
  summaryButton: {
    width: '100%',
  },
  modalDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  participantsList: {
    gap: spacing.sm,
  },
  participantItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
  },
  participantName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  selectedParticipant: {
    ...typography.bodySmallBold,
    color: colors.primaryLight,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

export default CallActiveScreen;
