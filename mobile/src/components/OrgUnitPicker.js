import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import CustomInput from './CustomInput';
import { useLanguage } from '../context/LanguageContext';
import { localizeText } from '../i18n/localize';
import { flipStyles } from '../i18n/rtlStyles';

/**
 * Bottom-sheet organizational unit picker shared by the directory filters and
 * the edit form. The tree is rendered inline (expand/collapse) and can also be
 * searched; a match is selected directly from the flattened result list.
 */
const OrgUnitPicker = ({
  visible,
  units = [],
  selectedId,
  onSelect,
  onClose,
  title,
  allowClear = false,
  inline = false,
}) => {
  const { height } = useWindowDimensions();
  const { t, isRTL, align } = useLanguage();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const index = useMemo(() => {
    const entries = new Map();
    const arrow = isRTL ? '\u2190' : '\u2192';

    const visit = (nodes, depth, parentPath) => {
      const ids = [];
      for (const unit of nodes || []) {
        const name = localizeText(unit.nameAr || unit.nameEn || unit.code);
        const path = parentPath ? `${parentPath} ${arrow} ${name}` : name;
        const childIds = (unit.children || []).map((child) => child.id);

        entries.set(unit.id, {
          id: unit.id,
          name,
          path,
          depth,
          childIds,
          hasChildren: childIds.length > 0,
          searchText: [unit.nameAr, unit.nameEn, unit.code, name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        });

        ids.push(unit.id);
        visit(unit.children, depth + 1, path);
      }
      return ids;
    };

    return { entries, rootIds: visit(units, 0, '') };
  }, [units, isRTL]);

  // Expand the branch containing the current selection each time the sheet
  // opens, so the selected unit is visible immediately.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setExpanded(() => {
      const next = new Set();
      if (selectedId) {
        const trail = [];
        const findTrail = (nodes, path) => {
          for (const unit of nodes || []) {
            const nextPath = [...path, unit.id];
            if (unit.id === selectedId) return nextPath;
            const match = findTrail(unit.children, nextPath);
            if (match) return match;
          }
          return null;
        };
        const ids = findTrail(units, []) || [];
        ids.forEach((id) => next.add(id));
      }
      if (next.size === 0) index.rootIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visible, selectedId, units, index.rootIds]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (text) {
      return Array.from(index.entries.values()).filter((entry) =>
        entry.searchText.includes(text)
      );
    }

    const out = [];
    const visit = (ids) => {
      for (const id of ids) {
        const entry = index.entries.get(id);
        if (!entry) continue;
        out.push(entry);
        if (expanded.has(id)) visit(entry.childIds);
      }
    };
    visit(index.rootIds);
    return out;
  }, [index, expanded, query]);

  const searching = query.trim().length > 0;

  const toggle = (unitId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const content = (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheetWrapper, { maxHeight: Math.round(height * 0.88) }]}
      >
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title || t('editEmployee.orgUnit')}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <CustomInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('common.search')}
              icon="search"
              style={styles.search}
            />

            <ScrollView
              style={[styles.treeScroll, { maxHeight: Math.max(160, Math.round(height * 0.55)) }]}
              keyboardShouldPersistTaps="handled"
            >
              {allowClear && !searching ? (
                <Pressable
                  onPress={() => {
                    onSelect('');
                    onClose();
                  }}
                  style={[styles.row, !selectedId && styles.rowSelected]}
                  accessibilityRole="button"
                >
                  <View style={styles.toggleSpacer} />
                  <Text style={[styles.rowName, { textAlign: align }, !selectedId && styles.rowNameSelected]}>
                    {t('directory.allUnits')}
                  </Text>
                  {!selectedId ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primaryLight} />
                  ) : null}
                </Pressable>
              ) : null}

              {rows.length === 0 ? (
                <Text style={[styles.empty, { textAlign: align }]}>{t('org.noOptions')}</Text>
              ) : (
                rows.map((row) => {
                  const isSelected = row.id === selectedId;
                  const isExpanded = expanded.has(row.id);
                  const toggleIcon = isExpanded
                    ? 'chevron-down'
                    : isRTL
                      ? 'chevron-back'
                      : 'chevron-forward';

                  return (
                    <View
                      key={row.id}
                      style={[
                        styles.row,
                        { paddingStart: spacing.sm + row.depth * spacing.md },
                        isSelected && styles.rowSelected,
                      ]}
                    >
                      {row.hasChildren && !searching ? (
                        <Pressable
                          onPress={() => toggle(row.id)}
                          hitSlop={8}
                          style={styles.toggle}
                          accessibilityRole="button"
                          accessibilityLabel={row.name}
                          accessibilityState={{ expanded: isExpanded }}
                        >
                          <Ionicons name={toggleIcon} size={16} color={colors.textSecondary} />
                        </Pressable>
                      ) : (
                        <View style={styles.toggleSpacer} />
                      )}

                      <Pressable
                        onPress={() => {
                          onSelect(row.id);
                          onClose();
                        }}
                        style={styles.rowBody}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.rowName,
                            { textAlign: align },
                            isSelected && styles.rowNameSelected,
                          ]}
                        >
                          {row.name}
                        </Text>
                        {row.depth > 0 ? (
                          <Text numberOfLines={1} style={[styles.rowPath, { textAlign: align }]}>
                            {row.path}
                          </Text>
                        ) : null}
                      </Pressable>

                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={18} color={colors.primaryLight} />
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
  );

  if (inline) {
    return visible ? (
      <View style={[StyleSheet.absoluteFill, styles.inlineOverlay]}>{content}</View>
    ) : null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {content}
    </Modal>
  );
};

const rawStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  inlineOverlay: {
    zIndex: 50,
    elevation: 50,
  },
  sheetWrapper: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    ...shadows.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderDark,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
  },
  sheetClose: {
    padding: spacing.xs,
  },
  search: {
    marginBottom: spacing.sm,
  },
  treeScroll: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingEnd: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: '#f5f9fc',
  },
  toggle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSpacer: {
    width: 24,
    height: 24,
  },
  rowBody: {
    flex: 1,
    marginStart: spacing.xs,
  },
  rowName: {
    ...typography.bodySmall,
    color: colors.text,
  },
  rowNameSelected: {
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
  rowPath: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textLight,
    paddingVertical: spacing.xl,
  },
});

export default OrgUnitPicker;
