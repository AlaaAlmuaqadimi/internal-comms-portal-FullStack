import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import Loading from '../../components/Loading';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';

const OrgScreen = () => {
  const { t, isRTL } = useLanguage();
  const [orgTree, setOrgTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [editingNode, setEditingNode] = useState(null);
  const [addingToNode, setAddingToNode] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', kitchen: '' });
  const [addForm, setAddForm] = useState({ name: '', kind: 'section', kitchen: '' });

  useEffect(() => {
    loadOrgTree();
  }, []);

  const loadOrgTree = async () => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      setOrgTree(mockData.orgTree);
      // توسيع العقدة الجذرية افتراضياً
      setExpandedNodes(new Set(['root']));
    } catch (error) {
      console.error('Error loading org tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleEdit = (node) => {
    setEditingNode(node.id);
    setEditForm({ name: node.name, kitchen: node.kitchen || '' });
  };

  const handleAddChild = (node) => {
    setAddingToNode(node.id);
    setAddForm({ name: '', kind: 'section', kitchen: '' });
  };

  const handleSaveEdit = () => {
    // في التطبيق الحقيقي سيتم حفظ التغييرات في الخادم
    setEditingNode(null);
  };

  const handleSaveAdd = () => {
    // في التطبيق الحقيقي سيتم إضافة الوحدة في الخادم
    setAddingToNode(null);
  };

  const getKindIcon = (kind) => {
    switch (kind) {
      case 'root':
        return 'business';
      case 'deputy':
        return 'star';
      case 'office':
        return 'mail';
      case 'directorate':
        return 'business';
      case 'section':
        return 'document';
      default:
        return 'ellipse';
    }
  };

  const getKindLabel = (kind) => {
    switch (kind) {
      case 'office':
        return t('org.kindOffice');
      case 'directorate':
        return t('org.kindDirectorate');
      case 'section':
        return t('org.kindSection');
      default:
        return '';
    }
  };

  const canHaveChildren = (kind) => kind !== 'section';
  const canEdit = (kind) => kind !== 'root' && kind !== 'group';

  const renderNode = (node, level = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <View key={node.id} style={[styles.nodeContainer, { [isRTL ? 'marginRight' : 'marginLeft']: level * 20 }]}>
        <View style={styles.nodeRow}>
          <Pressable
            style={styles.nodeToggle}
            onPress={() => hasChildren && toggleNode(node.id)}
          >
            {hasChildren && (
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-left'}
                size={20}
                color={colors.textSecondary}
              />
            )}
          </Pressable>

          <View style={styles.nodeIcon}>
            <Ionicons name={getKindIcon(node.kind)} size={20} color={colors.primaryLight} />
          </View>

          <Text style={styles.nodeName}>{localizeText(node.name)}</Text>

          <View style={styles.nodeActions}>
            {canHaveChildren(node.kind) && (
              <Pressable onPress={() => handleAddChild(node)} style={styles.actionButton}>
                <Text style={styles.actionText}>{t('org.addChild')}</Text>
              </Pressable>
            )}
            {canEdit(node.kind) && (
              <Pressable onPress={() => handleEdit(node)} style={styles.actionButton}>
                <Text style={styles.actionText}>{t('org.edit')}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* نموذج التعديل */}
        {editingNode === node.id && (
          <View style={styles.editForm}>
            <CustomInput
              label={t('org.name')}
              value={editForm.name}
              onChangeText={(text) => setEditForm({ ...editForm, name: text })}
              placeholder={t('org.unitNamePlaceholder')}
            />
            <CustomInput
              label={t('org.kitchenOptional')}
              value={editForm.kitchen}
              onChangeText={(text) => setEditForm({ ...editForm, kitchen: text })}
              placeholder={t('org.kitchenPlaceholder')}
            />
            <View style={styles.formActions}>
              <CustomButton
                title={t('common.save')}
                onPress={handleSaveEdit}
                size="small"
                style={styles.formButton}
              />
              <CustomButton
                title={t('common.delete')}
                onPress={() => {}}
                variant="danger"
                size="small"
                style={styles.formButton}
              />
            </View>
          </View>
        )}

        {/* نموذج الإضافة */}
        {addingToNode === node.id && (
          <View style={styles.addForm}>
            <CustomInput
              label={t('org.newUnitName')}
              value={addForm.name}
              onChangeText={(text) => setAddForm({ ...addForm, name: text })}
              placeholder={t('org.newUnitPlaceholder')}
            />
            <CustomInput
              label={t('org.kind')}
              value={addForm.kind}
              onChangeText={(text) => setAddForm({ ...addForm, kind: text })}
              placeholder={t('org.kindPlaceholder')}
            />
            <CustomInput
              label={t('org.kitchenOptional')}
              value={addForm.kitchen}
              onChangeText={(text) => setAddForm({ ...addForm, kitchen: text })}
              placeholder={t('org.kitchenPlaceholderShort')}
            />
            <View style={styles.formActions}>
              <CustomButton
                title={t('org.add')}
                onPress={handleSaveAdd}
                size="small"
                style={styles.formButton}
              />
              <CustomButton
                title={t('common.cancel')}
                onPress={() => setAddingToNode(null)}
                variant="outline"
                size="small"
                style={styles.formButton}
              />
            </View>
          </View>
        )}

        {/* الأبناء */}
        {isExpanded && hasChildren && (
          <View style={styles.childrenContainer}>
            {node.children.map((child) => renderNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <Loading fullScreen text={t('org.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* الهيدر */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.titleBorder} />
          <View>
            <Text style={styles.title}>{t('org.title')}</Text>
            <Text style={styles.subtitle}>
              {t('org.subtitle')}
            </Text>
          </View>
        </View>
      </View>

      {/* تنبيه */}
      <View style={styles.alert}>
        <Ionicons name="information-circle" size={20} color={colors.primaryLight} />
        <Text style={styles.alertText}>
          {t('org.alert')}
        </Text>
      </View>

      {/* الهيكل الإداري */}
      <ScrollView style={styles.content}>
        {orgTree && renderNode(orgTree)}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#edf5fa',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#d9e6ee',
    padding: spacing.md,
    margin: spacing.md,
  },
  alertText: {
    ...typography.bodySmall,
    color: '#27455b',
    flex: 1,
    marginRight: spacing.sm,
    lineHeight: 20,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  nodeContainer: {
    marginBottom: spacing.sm,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  nodeToggle: {
    padding: spacing.xs,
  },
  nodeIcon: {
    marginLeft: spacing.sm,
  },
  nodeName: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
    marginLeft: spacing.sm,
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
  editForm: {
    backgroundColor: '#f8fafc',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  addForm: {
    backgroundColor: '#f8fafc',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderStyle: 'dashed',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  formButton: {
    flex: 1,
  },
  childrenContainer: {
    marginTop: spacing.sm,
  },
});

export default OrgScreen;
