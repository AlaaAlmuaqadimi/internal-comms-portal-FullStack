import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/AppText';
import SafeAreaView from '../../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import Loading from '../../components/Loading';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import SelectField from '../../components/SelectField';
import Modal from '../../components/Modal';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import FormAlert from '../../components/FormAlert';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../services/api';
import { hasRole } from '../../utils/permissions';
import { flipStyles } from '../../i18n/rtlStyles';
import { FadeInView, ScaleInView } from '../../components/Motion';
import { listItemDelay } from '../../constants/motion';

// Mirrors the backend ALLOWED_PARENT_KINDS matrix in org.service.js. Keeping it
// here lets the form offer only structurally valid choices; the server still
// validates every write.
const CHILD_KINDS_BY_PARENT = {
  root: ['deputy', 'office', 'directorate', 'group', 'section'],
  deputy: ['office', 'directorate', 'group', 'section'],
  office: ['office', 'directorate', 'group', 'section'],
  directorate: ['office', 'section', 'group'],
  group: ['directorate', 'office', 'section'],
  section: [],
};

const KIND_ORDER = ['root', 'deputy', 'directorate', 'office', 'section', 'group'];

// Preferred kind when the add form opens for a given parent kind.
const DEFAULT_CHILD_KIND = {
  root: 'directorate',
  deputy: 'directorate',
  office: 'section',
  directorate: 'section',
  group: 'directorate',
};

const EMPTY_FORM = {
  nameAr: '',
  nameEn: '',
  code: '',
  kind: 'section',
  parentId: '',
  sortOrder: 0,
};

const generateCode = () => {
  const suffix = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `ORG-${Date.now().toString(36).toUpperCase()}${suffix}`;
};

const OrgScreen = () => {
  const { width, height } = useWindowDimensions();
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const canManage = hasRole(user, 'admin');

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  const [formMode, setFormMode] = useState(null); // 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const textFor = useCallback(
    (unit) => {
      if (!unit) return '';
      if (language === 'ar') return unit.nameAr || unit.nameEn || unit.code || '';
      return unit.nameEn || unit.nameAr || unit.code || '';
    },
    [language]
  );

  const loadOrgTree = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const roots = await api.org.getTree();
      const nextTree = Array.isArray(roots) ? roots : [];
      setTree(nextTree);
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        nextTree.forEach((root) => next.add(root.id));
        return next;
      });
    } catch (error) {
      setLoadError(error?.message || t('org.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadOrgTree();
    }, [loadOrgTree])
  );

  const flatUnits = useMemo(() => {
    const out = [];
    const visit = (nodes, depth, parentPath) => {
      for (const unit of nodes || []) {
        const label = textFor(unit);
        const path = parentPath ? `${parentPath} / ${label}` : label;
        out.push({ unit, depth, path, parentPath });
        visit(unit.children, depth + 1, path);
      }
    };
    visit(tree, 0, '');
    return out;
  }, [tree, textFor]);

  const unitById = useMemo(() => {
    const map = new Map();
    for (const entry of flatUnits) map.set(entry.unit.id, entry.unit);
    return map;
  }, [flatUnits]);

  const descendantIds = useCallback(
    (unitId) => {
      const ids = new Set();
      const walk = (unit) => {
        if (!unit) return;
        ids.add(unit.id);
        (unit.children || []).forEach(walk);
      };
      walk(unitById.get(unitId));
      return ids;
    },
    [unitById]
  );

  const toggleNode = (nodeId) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const kindLabel = (kind) => {
    switch (kind) {
      case 'root':
        return t('org.kindRoot');
      case 'deputy':
        return t('org.kindDeputy');
      case 'office':
        return t('org.kindOffice');
      case 'directorate':
        return t('org.kindDirectorate');
      case 'section':
        return t('org.kindSection');
      case 'group':
        return t('org.kindGroup');
      default:
        return kind || '';
    }
  };

  const getKindIcon = (kind) => {
    switch (kind) {
      case 'root':
        return 'business';
      case 'deputy':
        return 'ribbon';
      case 'directorate':
        return 'layers';
      case 'office':
        return 'briefcase';
      case 'section':
        return 'grid';
      case 'group':
        return 'albums';
      default:
        return 'ellipse';
    }
  };

  // Leadership in gold, directorates in blue, offices in green, sections grey.
  const kindTone = (kind) => {
    switch (kind) {
      case 'root':
      case 'deputy':
        return { fg: colors.warning, bg: colors.warningLight };
      case 'directorate':
        return { fg: colors.primaryLight, bg: colors.primarySoft };
      case 'office':
        return { fg: colors.success, bg: colors.successLight };
      default:
        return { fg: colors.textSecondary, bg: colors.iconSurface };
    }
  };

  const stats = useMemo(() => {
    const count = (kind) => flatUnits.filter((entry) => entry.unit.kind === kind).length;
    return [
      { key: 'directorate', label: t('org.statDirectorates'), value: count('directorate') },
      { key: 'office', label: t('org.statOffices'), value: count('office') },
      { key: 'section', label: t('org.statSections'), value: count('section') },
    ];
  }, [flatUnits, t]);

  const canHaveChildren = (kind) => (CHILD_KINDS_BY_PARENT[kind] || []).length > 0;
  const canEdit = (kind) => kind !== 'root';

  const nextSortOrder = (parentId) => {
    const siblings = parentId
      ? unitById.get(parentId)?.children || []
      : tree.filter((unit) => !unit.parentId);
    const max = siblings.reduce(
      (value, unit) => Math.max(value, Number(unit.sortOrder) || 0),
      -1
    );
    return max + 1;
  };

  const defaultParentId = () => tree[0]?.id || '';

  const defaultKindFor = (parentId) => {
    if (!parentId) return 'root';
    const parent = unitById.get(parentId);
    const allowed = CHILD_KINDS_BY_PARENT[parent?.kind] || [];
    const preferred = DEFAULT_CHILD_KIND[parent?.kind];
    return allowed.includes(preferred) ? preferred : allowed[0] || '';
  };

  const openAdd = (parentNode = null) => {
    if (!canManage) return;
    const parentId = parentNode?.id || defaultParentId();
    setFormMode('add');
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      parentId,
      kind: defaultKindFor(parentId),
      sortOrder: nextSortOrder(parentId),
    });
    setFormErrors({});
    setFormError(null);
  };

  const openEdit = (node) => {
    if (!canManage || !canEdit(node.kind)) return;
    setFormMode('edit');
    setEditingId(node.id);
    setForm({
      nameAr: node.nameAr || '',
      nameEn: node.nameEn || '',
      code: node.code || '',
      kind: node.kind || 'section',
      parentId: node.parentId || '',
      sortOrder: Number(node.sortOrder) || 0,
    });
    setFormErrors({});
    setFormError(null);
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormErrors({});
    setFormError(null);
  };

  const parentUnit = form.parentId ? unitById.get(form.parentId) : null;
  const allowedKindValues = form.parentId
    ? CHILD_KINDS_BY_PARENT[parentUnit?.kind] || []
    : tree.length > 0
      ? []
      : ['root'];

  const kindOptions = KIND_ORDER.filter((kind) => allowedKindValues.includes(kind)).map(
    (kind) => ({
      value: kind,
      label: kindLabel(kind),
    })
  );

  const excludedParentIds = useMemo(
    () => (formMode === 'edit' && editingId ? descendantIds(editingId) : new Set()),
    [formMode, editingId, descendantIds]
  );

  const parentOptions = flatUnits.map(({ unit, parentPath }) => ({
    value: unit.id,
    label: textFor(unit),
    description: [kindLabel(unit.kind), parentPath].filter(Boolean).join(' · '),
    disabled: excludedParentIds.has(unit.id) || !canHaveChildren(unit.kind),
  }));

  const handleParentChange = (parentId) => {
    const parent = unitById.get(parentId);
    const allowed = parentId ? CHILD_KINDS_BY_PARENT[parent?.kind] || [] : [];
    setForm((prev) => {
      const parentChanged = parentId !== prev.parentId;
      return {
        ...prev,
        parentId,
        kind: allowed.includes(prev.kind) ? prev.kind : allowed[0] || '',
        sortOrder: parentChanged ? nextSortOrder(parentId) : prev.sortOrder,
      };
    });
    setFormErrors((prev) => ({ ...prev, parentId: undefined, kind: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.nameAr.trim()) errors.nameAr = t('org.nameRequired');
    if (!form.kind) errors.kind = t('org.kindRequired');
    if (!form.parentId && form.kind !== 'root') errors.parentId = t('org.parentRequired');

    if (form.parentId && form.kind) {
      const parent = unitById.get(form.parentId);
      const allowed = CHILD_KINDS_BY_PARENT[parent?.kind] || [];
      if (!allowed.includes(form.kind)) errors.kind = t('org.kindParentInvalid');
    }

    const code = form.code.trim();
    if (code && !/^[A-Za-z0-9._-]+$/.test(code)) errors.code = t('org.codeInvalid');
    if (code.length > 64) errors.code = t('org.codeInvalid');

    if (form.kind === 'root' && form.parentId) errors.parentId = t('org.rootNoParent');

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const parentId = form.kind === 'root' ? null : form.parentId;
    const code = form.code.trim();
    const payload = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || undefined,
      kind: form.kind,
      parentId,
      sortOrder: form.sortOrder ?? 0,
    };
    // Add auto-generates the required code; edit leaves an empty field unchanged.
    if (code) payload.code = code;
    else if (formMode === 'add') payload.code = generateCode();

    setSaving(true);
    setFormError(null);
    try {
      if (formMode === 'add') {
        await api.org.addUnit(payload);
      } else {
        await api.org.updateUnit(editingId, payload);
      }
      if (parentId) {
        setExpandedNodes((prev) => new Set(prev).add(parentId));
      }
      closeForm();
      await loadOrgTree();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) setFormError(t('org.forbidden'));
        else if (error.status === 422 && error.details?.length) {
          setFormError(error.details.map((detail) => detail.message).join(' · '));
        } else setFormError(error.message || t('org.saveError'));
      } else {
        setFormError(error?.message || t('org.saveError'));
      }
    } finally {
      setSaving(false);
    }
  };

  const headerPadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.xl : spacing.md;

  const renderNode = (node, level = 0, index = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const tone = kindTone(node.kind);
    const headName =
      (language === 'ar' ? node.headNameAr : node.headNameEn) || node.headNameAr || node.headNameEn || '';
    const meta = [
      kindLabel(node.kind),
      hasChildren ? t('org.subUnits', { count: node.children.length }) : null,
    ]
      .filter(Boolean)
      .join(' \u00b7 ');

    return (
      <FadeInView key={node.id} delay={listItemDelay(index)} style={styles.node}>
        <Pressable
          onPress={() => hasChildren && toggleNode(node.id)}
          disabled={!hasChildren}
          style={({ pressed }) => [
            styles.nodeRow,
            level === 0 && styles.nodeRowRoot,
            pressed && styles.nodeRowPressed,
          ]}
          accessibilityRole={hasChildren ? 'button' : undefined}
          accessibilityState={hasChildren ? { expanded: isExpanded } : undefined}
        >
          <View style={[styles.kindIcon, { backgroundColor: tone.bg }]}>
            <Ionicons name={getKindIcon(node.kind)} size={18} color={tone.fg} />
          </View>

          <View style={styles.nodeTextWrap}>
            <Text style={[styles.nodeName, isSmallScreen && styles.nodeNameSmall]} numberOfLines={2}>
              {textFor(node)}
            </Text>
            <Text style={styles.nodeMeta} numberOfLines={1}>
              {meta}
            </Text>
            {node.headEmployeeId && headName ? (
              <View style={styles.headRow}>
                <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.nodeMeta} numberOfLines={1}>
                  {t('org.headLabel', { name: headName })}
                </Text>
              </View>
            ) : null}
          </View>

          {canManage && (
            <View style={styles.nodeActions}>
              {canHaveChildren(node.kind) && (
                <Pressable
                  onPress={() => openAdd(node)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.iconAction, styles.iconActionAdd, pressed && styles.iconActionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('org.addChildA11y')}
                >
                  <Ionicons name="add" size={18} color={colors.primaryLight} />
                </Pressable>
              )}
              {canEdit(node.kind) && (
                <Pressable
                  onPress={() => openEdit(node)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.iconAction, pressed && styles.iconActionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('org.edit')}
                >
                  <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          )}

          {hasChildren ? (
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textLight}
            />
          ) : null}
        </Pressable>

        {isExpanded && hasChildren && (
          <View style={styles.children}>
            {node.children.map((child, childIndex) => renderNode(child, level + 1, childIndex))}
          </View>
        )}
      </FadeInView>
    );
  };

  if (loading && tree.length === 0) {
    return <Loading fullScreen text={t('org.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container} animated>
      <View style={[styles.header, { paddingHorizontal: headerPadding }]}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <Text
            style={[styles.title, isSmallScreen && styles.titleSmall]}
            accessibilityRole="header"
            numberOfLines={1}
          >
            {t('org.title')}
          </Text>
        </View>

      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        style={styles.content}
        contentContainerStyle={[styles.contentInner, isLandscape && styles.contentLandscape]}
        keyboardShouldPersistTaps="handled"
      >
        {loadError ? (
          <ErrorState
            title={t('org.loadError')}
            description={loadError}
            onAction={loadOrgTree}
          />
        ) : tree.length === 0 ? (
          <EmptyState
            icon="business-outline"
            title={t('org.emptyTitle')}
            description={t('org.emptyDescription')}
            actionTitle={canManage ? t('org.addUnit') : undefined}
            onAction={canManage ? () => openAdd() : undefined}
          />
        ) : (
          <>
            <View style={styles.statsRow}>
              {stats.map((stat, statIndex) => (
                <ScaleInView key={stat.key} delay={statIndex * 70} style={styles.statCard}>
                  <View style={[styles.statDot, { backgroundColor: kindTone(stat.key).fg }]} />
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel} numberOfLines={1}>
                    {stat.label}
                  </Text>
                </ScaleInView>
              ))}
            </View>
            {tree.map((root, rootIndex) => renderNode(root, 0, rootIndex))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!formMode}
        onClose={closeForm}
        title={formMode === 'edit' ? t('org.editTitle') : t('org.addTitle')}
        size="medium"
        style={styles.formModal}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          style={{ maxHeight: height * 0.65 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <FormAlert message={formError} />

          <CustomInput
            label={formMode === 'edit' ? t('org.name') : t('org.newUnitName')}
            value={form.nameAr}
            onChangeText={(value) => setForm((prev) => ({ ...prev, nameAr: value }))}
            placeholder={t('org.newUnitPlaceholder')}
            required
            error={formErrors.nameAr}
          />

          <CustomInput
            label={t('org.nameEn')}
            value={form.nameEn}
            onChangeText={(value) => setForm((prev) => ({ ...prev, nameEn: value }))}
            placeholder={t('org.nameEnPlaceholder')}
          />

          <CustomInput
            label={t('org.code')}
            value={form.code}
            onChangeText={(value) => setForm((prev) => ({ ...prev, code: value }))}
            placeholder={t('org.codePlaceholder')}
            hint={t('org.codeHint')}
            error={formErrors.code}
          />

          <SelectField
            label={t('org.parent')}
            value={form.parentId}
            options={parentOptions}
            onSelect={handleParentChange}
            placeholder={t('org.parentPlaceholder')}
            hint={t('org.parentHint')}
            required={form.kind !== 'root'}
            error={formErrors.parentId}
            emptyText={t('org.noOptions')}
          />

          <SelectField
            label={t('org.kind')}
            value={form.kind}
            options={kindOptions}
            onSelect={(value) => setForm((prev) => ({ ...prev, kind: value }))}
            placeholder={t('org.kindPlaceholder')}
            required
            error={formErrors.kind}
            emptyText={t('org.noOptions')}
          />

          <View style={styles.formActions}>
            <CustomButton
              title={formMode === 'edit' ? t('common.save') : t('org.add')}
              onPress={handleSubmit}
              loading={saving}
              disabled={saving}
              style={styles.formButton}
            />
            <CustomButton
              title={t('common.cancel')}
              onPress={closeForm}
              variant="outline"
              style={styles.formButton}
            />
          </View>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    // Blends into the page: a modern large-title header without a divider.
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  titleBorder: {
    // A short brand accent beside the title.
    width: 4,
    height: 22,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  titleSmall: {
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  contentLandscape: {
    paddingHorizontal: '15%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  node: {
    marginBottom: spacing.sm,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    ...shadows.sm,
  },
  nodeRowRoot: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  nodeRowPressed: {
    opacity: 0.9,
  },
  kindIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeTextWrap: {
    flex: 1,
  },
  nodeName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  nodeNameSmall: {
    fontSize: 13,
  },
  nodeMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  nodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  iconActionAdd: {
    backgroundColor: colors.primarySoft,
  },
  iconActionPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  // Children hang from a thin guide line, so the hierarchy reads at a glance.
  children: {
    marginTop: spacing.sm,
    marginLeft: 18,
    paddingLeft: spacing.sm + 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  formModal: {
    maxWidth: 460,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  formButton: {
    flex: 1,
  },
});

export default OrgScreen;
