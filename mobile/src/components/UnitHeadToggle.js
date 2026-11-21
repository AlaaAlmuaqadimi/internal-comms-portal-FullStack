import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';

// Must match backend/src/modules/org/unitHead.service.js
export const HEADED_UNIT_KINDS = ['directorate', 'office', 'section'];

export function canHaveHead(unit) {
  return Boolean(unit && HEADED_UNIT_KINDS.includes(unit.kind));
}

/** Another person already heads this unit (the form then confirms replacing). */
export function otherHeadName(unit, employeeId, language) {
  if (!unit?.headEmployeeId || unit.headEmployeeId === employeeId) return null;
  return (language === 'en' ? unit.headNameEn : unit.headNameAr) || unit.headNameAr || unit.headNameEn || '—';
}

const TEXT = {
  ar: {
    label: 'مدير هذه الوحدة',
    hint: 'مدير الوحدة يستطيع الاتصال برئيس المصلحة ونائبه. لكل وحدة مدير واحد فقط.',
    replace: (name) => `للوحدة مدير حالياً: ${name}. عند الحفظ سيحل هذا الموظف محله.`,
  },
  en: {
    label: 'Head of this unit',
    hint: 'A unit head can call the Head of the Authority and the Deputy. Each unit has one head.',
    replace: (name) => `This unit is headed by ${name}. Saving makes this employee the head instead.`,
  },
};

/**
 * "Head of this unit" checkbox for the add / edit employee forms. Shown only
 * for directorates, offices and sections.
 */
export default function UnitHeadToggle({ unit, value, onChange, employeeId = null }) {
  const { language, align } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!canHaveHead(unit)) return null;

  const text = TEXT[language === 'en' ? 'en' : 'ar'];
  const current = otherHeadName(unit, employeeId, language);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(value) }}
        style={styles.row}
      >
        <Ionicons
          name={value ? 'checkbox' : 'square-outline'}
          size={22}
          color={value ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.label, { textAlign: align }]}>{text.label}</Text>
      </Pressable>
      <Text style={[styles.hint, { textAlign: align }]}>{text.hint}</Text>
      {value && current ? (
        <Text style={[styles.warning, { textAlign: align }]}>{text.replace(current)}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { ...typography.bodyBold, color: colors.text, flex: 1 },
    hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
    warning: { ...typography.caption, color: colors.warning || colors.textSecondary, marginTop: spacing.xs },
  });
