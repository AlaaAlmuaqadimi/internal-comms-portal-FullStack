import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';

const AppHeader = ({ 
  title, 
  subtitle, 
  showBack = false, 
  onBackPress, 
  rightComponent,
  showLogout = false,
  onLogoutPress 
}) => {
  const { t } = useLanguage();
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          {showBack && (
            <Pressable onPress={onBackPress} style={styles.backButton}>
              <Ionicons name="arrow-forward" size={24} color={colors.textWhite} />
            </Pressable>
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        <View style={styles.headerRight}>
          {rightComponent}
          {showLogout && (
            <Pressable onPress={onLogoutPress} style={styles.logoutButton}>
              <Text style={styles.logoutText}>{t('header.logout')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surfaceDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 4,
    borderBottomColor: colors.accent,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.textWhite,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textGold,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  logoutText: {
    ...typography.buttonSmall,
    color: colors.primaryLight,
  },
});

export default AppHeader;
