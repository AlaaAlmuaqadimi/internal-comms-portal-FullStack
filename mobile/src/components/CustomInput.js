import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';
import { useLanguage } from '../context/LanguageContext';
import { flipStyles } from '../i18n/rtlStyles';

const CustomInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  maxLength,
  required = false,
  error,
  hint,
  icon,
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
  disabled = false,
  onBlur,
  onFocus,
  autoCorrect = false,
  textContentType,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);
  const { align, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <View style={[
        styles.inputContainer,
        isFocused && styles.inputContainerFocused,
        error && styles.inputContainerError,
        disabled && styles.inputContainerDisabled,
      ]}>
        {icon && (
          <Ionicons 
            name={icon} 
            size={20} 
            color={isFocused ? colors.primaryLight : colors.textLight} 
          />
        )}
        <TextInput
          style={[
            styles.input,
            multiline && styles.multiline,
            { textAlign: align },
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoCorrect={autoCorrect}
          textContentType={textContentType}
          onFocus={() => {
            setIsFocused(true);
            if (onFocus) onFocus();
          }}
          onBlur={() => {
            setIsFocused(false);
            if (onBlur) onBlur();
          }}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setIsSecure(!isSecure)} style={styles.eyeIcon}>
            <Ionicons 
              name={isSecure ? 'eye-off' : 'eye'} 
              size={20} 
              color={colors.textLight} 
            />
          </Pressable>
        )}
      </View>
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
      {hint && !error && (
        <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
  },
  inputContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: borderRadius.md,
  paddingHorizontal: spacing.md,
},
  inputContainerFocused: {
    borderColor: colors.primaryLight,
  },
  inputContainerError: {
    borderColor: colors.dangerStrong,
  },
  inputContainerDisabled: {
    backgroundColor: colors.background,
    opacity: 0.6,
  },
  
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  eyeIcon: {
    padding: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.dangerStrong,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
});

export default CustomInput;
