import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import Loading from '../../components/Loading';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import SelectField from '../../components/SelectField';
import Modal from '../../components/Modal';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../services/api';
import { hasPermission } from '../../utils/permissions';
import { flipStyles } from '../../i18n/rtlStyles';

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
  const { t, isRTL, language, align } = useLanguage();
  const { user } = useAuth();
  const styles = useMemo(() => flipStyles(rawStyles, isRTL), [isRTL]);

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const canManage = hasPermission(user, 'org.manage');

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
      case 'directorate':
        return 'business';
      case 'deputy':
        return 'star';
      case 'office':
        return 'mail';
      case 'section':
        return 'document-text';
      case 'group':
        return 'albums';
      default:
        return 'ellipse';
    }
  };

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
  const nodePadding = isSmallScreen ? spacing.sm : isLargeScreen ? spacing.lg : spacing.md;
  const iconSize = isSmallScreen ? 16 : isLargeScreen ? 24 : 20;

  const renderNode = (node, level = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <View
        key={node.id}
        style={[
          styles.nodeContainer,
          { [isRTL ? 'marginRight' : 'marginLeft']: level * (isSmallScreen ? 12 : 20) },
        ]}
      >
        <View style={[styles.nodeRow, { padding: nodePadding }]}>
          <Pressable
            style={styles.nodeToggle}
            onPress={() => hasChildren && toggleNode(node.id)}
            disabled={!hasChildren}
          >
            {hasChildren && (
              <Ionicons
                name={isExpanded ? 'chevron-down' : isRTL ? 'chevron-back' : 'chevron-forward'}
                size={iconSize}
                color={colors.textSecondary}
              />
            )}
          </Pressable>

          <View style={styles.nodeIcon}>
            <Ionicons name={getKindIcon(node.kind)} size={iconSize} color={colors.primaryLight} />
          </View>

          <View style={styles.nodeTextWrap}>
            <Text style={[styles.nodeName, isSmallScreen && styles.nodeNameSmall]}>
              {textFor(node)}
            </Text>
            <Text style={styles.nodeKind}>{kindLabel(node.kind)}</Text>
          </View>

          {canManage && (
            <View style={styles.nodeActions}>
              {canHaveChildren(node.kind) && (
                <Pressable onPress={() => openAdd(node)} style={styles.actionButton}>
                  <Text style={[styles.actionText, isSmallScreen && styles.actionTextSmall]}>
                    {t('org.addChild')}
                  </Text>
                </Pressable>
              )}
              {canEdit(node.kind) && (
                <Pressable onPress={() => openEdit(node)} style={styles.actionButton}>
                  <Text style={[styles.actionText, isSmallScreen && styles.actionTextSmall]}>
                    {t('org.edit')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {isExpanded && hasChildren && (
          <View style={styles.childrenContainer}>
            {node.children.map((child) => renderNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  if (loading && tree.length === 0) {
    return <Loading fullScreen text={t('org.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { padding: headerPadding }]}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View style={styles.headerText}>
            <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>{t('org.title')}</Text>
            <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              {t('org.subtitle')}
            </Text>
          </View>
        </View>

        {canManage && (
          <CustomButton
            title={t('org.addUnit')}
            onPress={() => openAdd()}
            icon="add"
            iconPosition="left"
            size="small"
            style={styles.addButton}
          />
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={isLandscape && styles.contentLandscape}
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
          tree.map((root) => renderNode(root))
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
          style={{ maxHeight: height * 0.65 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {formError && (
            <View style={styles.formErrorBox}>
              <Text style={[styles.formErrorText, { textAlign: align }]}>{formError}</Text>
            </View>
          )}

          <CustomInput
            label={formMode === 'edit' ? t('org.name') : t('org.newUnitName')}
            value={form.nameAr}
            onChangeText={(value) => setForm((prev) => ({ ...prev, nameAr: value }))}
            placeholder={t('org.newUnitPlaceholder')}
            required
            error={formErrors.nameAr}
            size="small"
          />

          <CustomInput
            label={t('org.nameEn')}
            value={form.nameEn}
            onChangeText={(value) => setForm((prev) => ({ ...prev, nameEn: value }))}
            placeholder={t('org.nameEnPlaceholder')}
            size="small"
          />

          <CustomInput
            label={t('org.code')}
            value={form.code}
            onChangeText={(value) => setForm((prev) => ({ ...prev, code: value }))}
            placeholder={t('org.codePlaceholder')}
            hint={t('org.codeHint')}
            error={formErrors.code}
            size="small"
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
              size="small"
              style={styles.formButton}
            />
            <CustomButton
              title={t('common.cancel')}
              onPress={closeForm}
              variant="outline"
              size="small"
              style={styles.formButton}
            />
          </View>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
};

const rawStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  titleBorder: {
    width: 4,
    height: 50,
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
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  subtitleSmall: {
    fontSize: 11,
  },
  addButton: {
    alignSelf: 'flex-start',
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  contentLandscape: {
    paddingHorizontal: '15%',
  },
  nodeContainer: {
    marginBottom: spacing.sm,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  nodeIcon: {},
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
  nodeKind: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
  nodeToggle: {
    padding: spacing.xs,
  },
  nodeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  actionTextSmall: {
    fontSize: 10,
  },
  childrenContainer: {
    marginTop: spacing.sm,
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
  formErrorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5b3a6',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  formErrorText: {
    ...typography.bodySmall,
    color: '#8a3a24',
  },
});

export default OrgScreen;
