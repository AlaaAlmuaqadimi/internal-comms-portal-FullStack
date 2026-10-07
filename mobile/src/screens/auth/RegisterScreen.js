import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius } from '../../constants/spacing';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import Loading from '../../components/Loading';
import { mockData } from '../../utils/mockData';

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();
  const { t } = useLanguage();
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* الهيدر */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.logoContainer}>
                <Ionicons name="business" size={32} color={colors.textGold} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>{t('common.appName')}</Text>
                <Text style={styles.headerSubtitle}>{t('common.appTagline')}</Text>
              </View>
            </View>
          </View>

          {/* المحتوى */}
          <View style={styles.content}>
            <View style={styles.titleContainer}>
              <View style={styles.titleBorder} />
              <View style={styles.titleText}>
                <Text style={styles.title}>{t('register.title')}</Text>
                <Text style={styles.subtitle}>
                  {t('register.subtitle')}
                </Text>
              </View>
            </View>

            <View style={styles.form}>
              {errors.general && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              )}

              {/* بيانات الحساب */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('register.accountInfo')}</Text>

                <CustomInput
                  label={t('register.fullName')}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder={t('register.fullNamePlaceholder')}
                  required
                  error={errors.name}
                  icon="person"
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
                />
              </View>

              {/* الحسابات المتاحة */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('register.contactsTitle')}</Text>
                <Text style={styles.sectionDescription}>
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
                        <Text style={styles.contactName}>{localizeText(contact.name)}</Text>
                        <Text style={styles.contactUnit}>{localizeText(contact.unitName)}</Text>
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

const styles = StyleSheet.create({
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
  header: {
    backgroundColor: colors.surfaceDark,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
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
  headerSubtitle: {
    ...typography.caption,
    color: colors.textGold,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  titleBorder: {
    width: 4,
    height: 80,
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
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 24,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorContainer: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5b3a6',
    padding: spacing.sm,
    marginBottom: spacing.md,
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
    marginBottom: spacing.md,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  contactsList: {
    marginBottom: spacing.md,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
  contactUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
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
