import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
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

const CallActiveScreen = ({ route, navigation }) => {
  const { contact } = route.params;
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

  if (callEnded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.summaryContainer}>
          <View style={styles.summaryIcon}>
            <Ionicons name="call" size={32} color={colors.primaryLight} />
          </View>
          <Text style={styles.summaryTitle}>انتهت المكالمة</Text>

          <View style={styles.summaryDetails}>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryLabel}>الموظف: </Text>
              {contact.name}
            </Text>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryLabel}>مدة المكالمة: </Text>
              {formatDuration(duration)}
            </Text>
          </View>

          <View style={styles.summaryActions}>
            <CustomButton
              title="العودة إلى دليل الموظفين"
              onPress={() => navigation.navigate('Directory')}
              style={styles.summaryButton}
            />
            <CustomButton
              title="المكالمات الأخيرة"
              onPress={() => navigation.navigate('Calls')}
              variant="outline"
              style={styles.summaryButton}
            />
            <CustomButton
              title="اتصال مرة أخرى"
              onPress={handleRestart}
              variant="outline"
              style={styles.summaryButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* معلومات المكالمة */}
        <View style={styles.callInfo}>
          <View style={styles.callHeader}>
            <UserAvatar person={contact} size="xlarge" />
            <View style={styles.callHeaderText}>
              <Text style={styles.callLabel}>
                {contact.isKitchen ? 'التواصل مع' : 'الموظف المتصل'}
              </Text>
              <Text style={styles.callName}>{contact.name}</Text>
              <Text style={styles.callUnit}>{contact.unitName}</Text>
            </View>
            <StatusBadge
              status={contact.isKitchen ? 'kitchen' : 'online'}
              text={contact.isKitchen ? 'خدمة متاحة' : 'متصل الآن'}
            />
          </View>

          <View style={styles.callMeta}>
            <View style={styles.durationContainer}>
              <Text style={styles.durationLabel}>مدة المكالمة</Text>
              <Text style={styles.duration}>{formatDuration(duration)}</Text>
            </View>
            <View style={styles.secureBadge}>
              <Ionicons name="shield" size={16} color={colors.primaryLight} />
              <Text style={styles.secureText}>مكالمة داخلية آمنة</Text>
            </View>
          </View>
        </View>

        {/* التحكم بالمكالمة */}
        <View style={styles.controls}>
          <Text style={styles.controlsTitle}>التحكم بالمكالمة</Text>

          <View style={styles.controlsGrid}>
            <Pressable
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={24}
                color={isMuted ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>
                {isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons
                name="volume-high"
                size={24}
                color={isSpeaker ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, isSpeaker && styles.controlLabelActive]}>
                {isSpeaker ? 'إيقاف مكبر الصوت' : 'مكبر الصوت'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.controlButton, showKeypad && styles.controlButtonActive]}
              onPress={() => setShowKeypad(!showKeypad)}
            >
              <Ionicons
                name="grid"
                size={24}
                color={showKeypad ? colors.textWhite : colors.text}
              />
              <Text style={[styles.controlLabel, showKeypad && styles.controlLabelActive]}>
                لوحة الأرقام
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={() => setShowParticipantModal(true)}
            >
              <Ionicons name="person-add" size={24} color={colors.text} />
              <Text style={styles.controlLabel}>إضافة مشارك</Text>
            </Pressable>
          </View>

          {/* لوحة الأرقام */}
          {showKeypad && (
            <View style={styles.keypad}>
              <View style={styles.keypadHeader}>
                <Text style={styles.keypadTitle}>لوحة الأرقام</Text>
                <Pressable onPress={() => setShowKeypad(false)} style={styles.keypadClose}>
                  <Text style={styles.keypadCloseText}>إغلاق</Text>
                </Pressable>
              </View>

              <Text style={styles.keypadInput}>{keypadInput || 'الأرقام المُدخلة'}</Text>

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
                <Text style={styles.keypadClearText}>مسح الأرقام</Text>
              </Pressable>
            </View>
          )}

          {/* زر إنهاء المكالمة */}
          <View style={styles.endCallContainer}>
            <Pressable style={styles.endCallButton} onPress={handleEndCall}>
              <Ionicons name="call" size={24} color={colors.textWhite} />
              <Text style={styles.endCallText}>إنهاء المكالمة</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          معاينة تفاعلية فقط؛ لا تُجرى مكالمة صوتية فعلية أو إضافة مشارك حقيقية.
        </Text>
      </ScrollView>

      {/* نافذة إضافة مشارك */}
      <Modal
        visible={showParticipantModal}
        onClose={() => setShowParticipantModal(false)}
        title="إضافة مشارك"
        size="medium"
      >
        <Text style={styles.modalDescription}>
          اختر أحد الحسابات المتاحة لك لعرض حالة الاختيار في المعاينة.
        </Text>

        <View style={styles.participantsList}>
          {participants.map((participant) => (
            <Pressable
              key={participant.id}
              style={styles.participantItem}
              onPress={() => handleAddParticipant(participant)}
            >
              <Text style={styles.participantName}>{participant.name}</Text>
            </Pressable>
          ))}
        </View>

        {selectedParticipant && (
          <Text style={styles.selectedParticipant}>
            تم اختيار: {selectedParticipant.name}
          </Text>
        )}
      </Modal>

      {/* نافذة تأكيد إنهاء المكالمة */}
      <ConfirmDialog
        visible={showEndModal}
        onClose={() => setShowEndModal(false)}
        onConfirm={confirmEndCall}
        title="تأكيد إنهاء المكالمة"
        description="هل تريد إنهاء معاينة المكالمة وعرض ملخصها؟"
        confirmText="تأكيد الإنهاء"
        cancelText="متابعة المكالمة"
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
  callInfo: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    margin: spacing.md,
    ...shadows.sm,
  },
  callHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  callHeaderText: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  callLabel: {
    ...typography.bodySmall,
    color: colors.textLight,
  },
  callName: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.xs,
  },
  callUnit: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  durationContainer: {
    alignItems: 'center',
  },
  durationLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  duration: {
    ...typography.h1,
    color: colors.text,
    marginTop: spacing.xs,
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
  controls: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    margin: spacing.md,
    ...shadows.sm,
  },
  controlsTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
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
    padding: spacing.md,
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
  controlLabelActive: {
    color: colors.textWhite,
  },
  keypad: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  keypadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  keypadTitle: {
    ...typography.h4,
    color: colors.text,
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
    marginBottom: spacing.md,
    minHeight: 40,
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
    marginTop: spacing.md,
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
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
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
    paddingVertical: spacing.md,
  },
  endCallText: {
    ...typography.button,
    color: colors.textWhite,
    marginRight: spacing.sm,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    margin: spacing.md,
  },
  summaryContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    margin: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  summaryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eaf1f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  summaryTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  summaryDetails: {
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryText: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  participantsList: {
    gap: spacing.sm,
  },
  participantItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.md,
  },
  participantName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  selectedParticipant: {
    ...typography.bodySmallBold,
    color: colors.primaryLight,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

export default CallActiveScreen;
