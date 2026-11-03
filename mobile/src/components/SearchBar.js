import React, { useMemo } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { flipStyles } from '../i18n/rtlStyles';

const SearchBar = ({
  value,
  onChangeText,
  placeholder,
  onClear,
  style,
}) => {
  const { t, align, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="search" size={20} color={colors.textLight} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || t('common.search')}
        placeholderTextColor={colors.textLight}
        textAlign={align}
      />
      {value && onClear && (
        <Pressable onPress={onClear} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color={colors.textLight} />
        </Pressable>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginLeft: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
  },
});

export default SearchBar;
