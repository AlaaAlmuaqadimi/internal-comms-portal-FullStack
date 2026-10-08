import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import Loading from '../../components/Loading';
import { mockData } from '../../utils/mockData';
import { flipStyles } from '../../i18n/rtlStyles';

const RegisterScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { register } = useAuth();
  const { t, isRTL } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);
  
  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    unit: '',
    contacts: [],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t('register.nameRequired');
    }

    if (!formData.username.trim()) {
      newErrors.username = t('register.usernameRequired');
    } else if (formData.username.length < 3) {
      newErrors.username = t('register.usernameMin');
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = t('register.usernameInvalid');
    }

    if (!formData.password) {
      newErrors.password = t('register.passwordRequired');
    } else if (formData.password.length < 8) {
      newErrors.password = t('register.passwordMin');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('register.confirmPasswordRequired');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('register.passwordsMismatch');
    }

    if (!formData.unit) {
      newErrors.unit = t('register.unitRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await register(formData);
      if (!result.success) {
        setErrors({ general: result.error });
      }
    } catch (error) {
      setErrors({ general: t('register.error') });
    } finally {
      setLoading(false);
    }
  };

  // أحجام متجاوبة
  const logoSize = isSmallScreen ? 40 : isLargeScreen ? 56 : 48;
  const headerPadding = isSmallScreen ? spacing.md : isLargeScreen ? spacing.xl : spacing.lg;
  const contentPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;
  const cardPadding = isSmallScreen ? spacing.md : isLargeScreen ? spacing.xl : spacing.lg;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isLandscape && styles.scrollContentLandscape,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* الهيدر */}
          <View style={[styles.header, { padding: headerPadding }]}>
            <View style={styles.headerContent}>
              <View style={[styles.logoContainer, { width: logoSize, height: logoSize, borderRadius: logoSize / 4 }]}>
                <Ionicons name="business" size={logoSize / 2} color={colors.textGold} />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.headerTitle, isSmallScreen && styles.headerTitleSmall]}>
                  {t('common.appName')}
                </Text>
                <Text style={[styles.headerSubtitle, isSmallScreen && styles.headerSubtitleSmall]}>
                  {t('common.appTagline')}
                </Text>
              </View>
            </View>
          </View>

          {/* المحتوى */}
          <View style={[styles.content, { padding: contentPadding }]}>
            <View style={styles.titleContainer}>
              <View style={styles.titleBorder} />
              <View style={styles.titleText}>
                <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
                  {t('register.title')}
                </Text>
                <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
                  {t('register.subtitle')}
                </Text>
              </View>
            </View>

            <View style={[styles.form, { padding: cardPadding }]}>
              {errors.general && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              )}

              {/* بيانات الحساب */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('register.accountInfo')}
                </Text>

                <CustomInput
                  label={t('register.fullName')}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder={t('register.fullNamePlaceholder')}
                  required
                  error={errors.name}
                  icon="person"
                  size="small"
                />

                <CustomInput
                  label={t('register.username')}
                  value={formData.username}
                  onChangeText={(text) => setFormData({ ...formData, username: text })}
                  placeholder={t('register.usernamePlaceholder')}
                  keyboardType="default"
                  autoCapitalize="none"
                  required
                  error={errors.username}
                  hint={t('register.usernameHint')}
                  icon="at"
                  size="small"
                />

                <CustomInput
                  label={t('register.password')}
                  value={formData.password}
                  onChangeText={(text) => setFormData({ ...formData, password: text })}
                  placeholder={t('register.passwordPlaceholder')}
                  secureTextEntry
                  required
                  error={errors.password}
                  hint={t('register.passwordHint')}
                  icon="lock-closed"
                  size="small"
                />

                <CustomInput
                  label={t('register.confirmPassword')}
                  value={formData.confirmPassword}
                  onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
                  placeholder={t('register.confirmPasswordPlaceholder')}
                  secureTextEntry
                  required
                  error={errors.confirmPassword}
                  icon="lock-closed"
                  size="small"
                />

                <CustomInput
                  label={t('register.unit')}
                  value={formData.unit}
                  onChangeText={(text) => setFormData({ ...formData, unit: text })}
                  placeholder={t('register.unitPlaceholder')}
                  required
                  error={errors.unit}
                  hint={t('register.unitHint')}
                  icon="business"
                  size="small"
                />
              </View>

              {/* الحسابات المتاحة */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isSmallScreen && styles.sectionTitleSmall]}>
                  {t('register.contactsTitle')}
                </Text>
                <Text style={[styles.sectionDescription, isSmallScreen && styles.sectionDescriptionSmall]}>
                  {t('register.contactsDescription')}
                </Text>

                <View style={styles.contactsList}>
                  {mockData.availableContacts.map((contact) => (
                    <Pressable
                      key={contact.id}
                      style={[
                        styles.contactItem,
                        formData.contacts.includes(contact.id) && styles.contactItemSelected,
                      ]}
                      onPress={() => {
                        const newContacts = formData.contacts.includes(contact.id)
                          ? formData.contacts.filter(id => id !== contact.id)
                          : [...formData.contacts, contact.id];
                        setFormData({ ...formData, contacts: newContacts });
                      }}
                    >
                      <View style={styles.contactInfo}>
                        <Text style={[styles.contactName, isSmallScreen && styles.contactNameSmall]}>
                          {localizeText(contact.name)}
                        </Text>
                        <Text style={[styles.contactUnit, isSmallScreen && styles.contactUnitSmall]}>
                          {localizeText(contact.unitName)}
                        </Text>
                      </View>
                      <View style={[
                        styles.checkbox,
                        formData.contacts.includes(contact.id) && styles.checkboxChecked,
                      ]}>
                        {formData.contacts.includes(contact.id) && (
                          <Ionicons name="checkmark" size={16} color={colors.textWhite} />
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.selectedCount}>
                  {t('common.selected', { count: formData.contacts.length })}
                </Text>
              </View>

              <CustomButton
                title={t('register.submit')}
                onPress={handleRegister}
                loading={loading}
                style={styles.registerButton}
                size="small"
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('register.haveAccount')}</Text>
              <Pressable onPress={() => navigation.navigate('Login')}>
                <Text style={styles.footerLink}>{t('register.loginLink')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const rawStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
  header: {
    backgroundColor: colors.surfaceDark,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textWhite,
  },
  headerTitleSmall: {
    fontSize: 18,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textGold,
    marginTop: 2,
  },
  headerSubtitleSmall: {
    fontSize: 11,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  titleBorder: {
    width: 4,
    height: 70,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginLeft: spacing.md,
  },
  titleText: {
    flex: 1,
  },
  title: {
    ...typography.h1,
    color: colors.text,
  },
  titleSmall: {
    fontSize: 22,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  subtitleSmall: {
    fontSize: 13,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  errorContainer: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5b3a6',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: '#8a3a24',
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionTitleSmall: {
    fontSize: 16,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  sectionDescriptionSmall: {
    fontSize: 11,
  },
  contactsList: {
    marginBottom: spacing.sm,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  contactItemSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: '#f5f9fc',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  contactNameSmall: {
    fontSize: 13,
  },
  contactUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactUnitSmall: {
    fontSize: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  selectedCount: {
    ...typography.bodyBold,
    color: colors.primaryLight,
    textAlign: 'center',
  },
  registerButton: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerLink: {
    ...typography.bodyBold,
    color: colors.primaryLight,
    marginRight: spacing.xs,
    textDecorationLine: 'underline',
  },
});

export default RegisterScreen;
