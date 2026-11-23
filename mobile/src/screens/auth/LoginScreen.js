import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import Loading from '../../components/Loading';
import Logo from '../../components/Logo';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView, ScaleInView } from '../../components/Motion';

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();
  const { t, language, toggleLanguage, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = t('validation.usernameRequired');
    }

    if (!formData.password) {
      newErrors.password = t('validation.passwordRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Typing in a field clears its own error and the general banner.
  const updateField = (field) => (text) => {
    setFormData((prev) => ({ ...prev, [field]: text }));
    setErrors((prev) =>
      prev[field] || prev.general ? { ...prev, [field]: undefined, general: undefined } : prev
    );
  };

  const handleLogin = async () => {
    if (loading) return;
    if (!validateForm()) return;

    setErrors({});
    setLoading(true);
    try {
      const result = await login(formData.username, formData.password);
      if (!result.success) {
        const message =
          result.error && result.error.startsWith('validation.')
            ? t(result.error)
            : result.error || t('login.error');
        setErrors({ general: message });
        // Never leave a rejected password sitting in the field.
        setFormData((prev) => ({ ...prev, password: '' }));
      }
      // On success, AppNavigator re-renders off isAuthenticated in AuthContext.
    } catch (error) {
      setErrors({ general: t('login.error') });
      setFormData((prev) => ({ ...prev, password: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* اللغة */}
          <View style={styles.topBar}>
            <Pressable
              onPress={toggleLanguage}
              style={({ pressed }) => [styles.langPill, pressed && styles.langPillPressed]}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="globe-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.langButtonText}>
                {language === 'ar' ? 'English' : 'العربية'}
              </Text>
            </Pressable>
          </View>

          {/* الشعار */}
          <View style={styles.hero}>
            <ScaleInView style={styles.heroLogoRing} from={0.7} duration={420}>
              <Logo size={88} />
            </ScaleInView>
            <Text style={styles.heroTitle} accessibilityRole="header">
              {t('common.appName')}
            </Text>
            <Text style={styles.heroSubtitle}>{t('common.appTagline')}</Text>
          </View>

          {/* المحتوى */}
          <View style={styles.content}>
            <FadeInView delay={150} distance={20} style={styles.form}>
              <Text style={styles.title}>{t('login.title')}</Text>
              <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

              {!!errors.general && (
                <View
                  style={styles.errorContainer}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  <Ionicons name="alert-circle" size={20} color={colors.dangerStrong} />
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              )}

              <CustomInput
                label={t('login.username')}
                value={formData.username}
                onChangeText={updateField('username')}
                placeholder={t('login.usernamePlaceholder')}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                maxLength={64}
                required
                error={errors.username}
                icon="person"
              />

              <CustomInput
                label={t('login.password')}
                value={formData.password}
                onChangeText={updateField('password')}
                placeholder={t('login.passwordPlaceholder')}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                maxLength={200}
                required
                error={errors.password}
                icon="lock-closed"
              />

              <CustomButton
                title={t('login.submit')}
                onPress={handleLogin}
                loading={loading}
                size="large"
                icon={isRTL ? 'arrow-back' : 'arrow-forward'}
                iconPosition="end"
                style={styles.loginButton}
              />
            </FadeInView>

            <FadeInView delay={260} from="none" style={styles.footer}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textLight} />
              <Text style={styles.footerText}>{t('login.contactAdmin')}</Text>
            </FadeInView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langPillPressed: {
    backgroundColor: colors.primarySoft,
  },
  langButtonText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  heroLogoRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: spacing.md,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    marginBottom: spacing.lg,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.dangerStrong,
    flex: 1,
  },
  loginButton: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    flexShrink: 1,
  },
});

export default LoginScreen;
