import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Keyboard } from 'react-native';
import { Text, TextInput } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * Search field. While typing, a "Done" button beside it hides the keyboard;
 * the keyboard's own search key hides it too.
 */
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
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const hideKeyboard = () => {
    inputRef.current?.blur?.();
    Keyboard.dismiss();
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, focused && styles.containerFocused, style]}>
        <Ionicons
          name="search"
          size={20}
          color={focused ? colors.primaryLight : colors.textLight}
          style={styles.icon}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || t('common.search')}
          placeholderTextColor={colors.textLight}
          textAlign={align}
          returnKeyType="search"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={hideKeyboard}
          accessibilityRole="search"
          accessibilityLabel={placeholder || t('common.search')}
        />
        {!!value && !!onClear && (
          <Pressable
            onPress={onClear}
            style={styles.clearButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.clearSearch')}
          >
            <Ionicons name="close-circle" size={20} color={colors.textLight} />
          </Pressable>
        )}
      </View>
      {focused && (
        <Pressable
          onPress={hideKeyboard}
          hitSlop={8}
          style={styles.doneButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.hideKeyboard')}
        >
          <Text style={styles.doneText}>{t('common.done')}</Text>
        </Pressable>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  containerFocused: {
    borderColor: colors.primaryLight,
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
  doneButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  doneText: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
});

export default SearchBar;
