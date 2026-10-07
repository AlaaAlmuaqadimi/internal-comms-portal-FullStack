import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import SearchBar from '../../components/SearchBar';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';

const SettingsScreen = () => {
  const { user, logout, updateUser } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKitchen, setSelectedKitchen] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedContacts(user.contacts || []);
      setSelectedKitchen(user.kitchenChoice || null);
    }
  }, [user]);

  const handleSaveContacts = async () => {
    setLoading(true);
    try {
      await updateUser({ contacts: selectedContacts });
    } catch (error) {
      console.error('Error saving contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKitchen = async () => {
    setLoading(true);
    try {
      await updateUser({ kitchenChoice: selectedKitchen });
    } catch (error) {
      console.error('Error saving kitchen:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (contactId) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAll = () => {
    setSelectedContacts(mockData.availableContacts.map(c => c.id));
  };

  const selectNone = () => {
    setSelectedContacts([]);
  };

  const filteredContacts = mockData.availableContacts.filter(contact =>
    localizeText(contact.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.name.includes(searchQuery) ||
    contact.unitName.includes(searchQuery) ||
    contact.management.includes(searchQuery)
  );

  const kitchenOptions = mockData.kitchens;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* الهيدر */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <View>
              <Text style={styles.title}>{t('settings.title')}</Text>
              <Text style={styles.subtitle}>
                {t('settings.subtitle')}
              </Text>
            </View>
          </View>
        </View>

        {/* حسابي */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.myAccount')}</Text>
          <View style={styles.profileCard}>
            <UserAvatar person={user} size="xlarge" />
            <View style={styles.profileInfo}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('settings.nameLabel')}</Text>
                <Text style={styles.profileValue}>{user?.name}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('settings.usernameLabel')}</Text>
                <Text style={styles.profileValue}>{user?.username}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('settings.managementLabel')}</Text>
                <Text style={styles.profileValue}>{user?.management}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>{t('settings.orgPathLabel')}</Text>
                <Text style={styles.profileValue}>{user?.path}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* مطبخ الخدمة */}
        {kitchenOptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.kitchenTitle')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.kitchenDescription')}
            </Text>
            <View style={styles.kitchenOptions}>
              {kitchenOptions.map((kitchen) => (
                <Pressable
                  key={kitchen.id}
                  style={[
                    styles.kitchenOption,
                    selectedKitchen === kitchen.id && styles.kitchenOptionSelected,
                  ]}
                  onPress={() => setSelectedKitchen(kitchen.id)}
                >
                  <View style={styles.kitchenRadio}>
                    {selectedKitchen === kitchen.id && (
                      <View style={styles.kitchenRadioSelected} />
                    )}
                  </View>
                  <Text style={styles.kitchenName}>{localizeText(kitchen.name)}</Text>
                </Pressable>
              ))}
            </View>
            <CustomButton
              title={t('common.save')}
              onPress={handleSaveKitchen}
              loading={loading}
              style={styles.saveButton}
            />
          </View>
        )}

        {/* الحسابات المتاحة للتواصل */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.availableContacts')}</Text>
          <Text style={styles.sectionDescription}>
            {t('settings.availableContactsDescription')}
          </Text>

          <View style={styles.contactsHeader}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('settings.searchPlaceholder')}
              onClear={() => setSearchQuery('')}
              style={styles.searchBar}
            />
            <View style={styles.contactsActions}>
              <Pressable onPress={selectAll} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>{t('settings.selectAll')}</Text>
              </Pressable>
              <Pressable onPress={selectNone} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>{t('settings.selectNone')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.contactsList}>
            {filteredContacts.map((contact) => (
              <Pressable
                key={contact.id}
                style={[
                  styles.contactItem,
                  selectedContacts.includes(contact.id) && styles.contactItemSelected,
                ]}
                onPress={() => toggleContact(contact.id)}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{localizeText(contact.name)}</Text>
                  <Text style={styles.contactUnit}>{localizeText(contact.unitName)}</Text>
                </View>
                <View style={[
                  styles.checkbox,
                  selectedContacts.includes(contact.id) && styles.checkboxChecked,
                ]}>
                  {selectedContacts.includes(contact.id) && (
                    <Ionicons name="checkmark" size={16} color={colors.textWhite} />
                  )}
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.contactsFooter}>
            <Text style={styles.selectedCount}>
              {t('common.selected', { count: selectedContacts.length })}
            </Text>
            <CustomButton
              title={t('common.saveChanges')}
              onPress={handleSaveContacts}
              loading={loading}
            />
          </View>
        </View>

        {/* اللغة */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.languageTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('settings.languageDescription')}</Text>
          <Pressable style={styles.languageRow} onPress={toggleLanguage}>
            <View style={styles.languageIcon}>
              <Ionicons name="language" size={20} color={colors.primaryLight} />
            </View>
            <View style={styles.languageInfo}>
              <Text style={styles.languageValue}>
                {language === 'ar' ? t('settings.arabic') : t('settings.english')}
              </Text>
            </View>
            <Ionicons name={language === 'ar' ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.textLight} />
          </Pressable>
        </View>

        {/* تسجيل الخروج */}
        <View style={styles.section}>
          <CustomButton
            title={t('settings.logout')}
            onPress={logout}
            variant="danger"
            icon="log-out"
            style={styles.logoutButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleBorder: {
    width: 4,
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    margin: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  profileRow: {
    marginBottom: spacing.sm,
  },
  profileLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  profileValue: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 2,
  },
  kitchenOptions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kitchenOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e9dcc2',
    padding: spacing.md,
  },
  kitchenOptionSelected: {
    borderColor: colors.warning,
    borderWidth: 2,
  },
  kitchenRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  kitchenRadioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
  },
  kitchenName: {
    ...typography.bodyBold,
    color: '#5b4515',
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  contactsHeader: {
    marginBottom: spacing.md,
  },
  searchBar: {
    marginBottom: spacing.sm,
  },
  contactsActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  actionButtonText: {
    ...typography.buttonSmall,
    color: colors.primaryLight,
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
  contactsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: '#eaf1f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  languageInfo: {
    flex: 1,
  },
  languageValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  logoutButton: {
    marginTop: spacing.md,
  },
});

export default SettingsScreen;
