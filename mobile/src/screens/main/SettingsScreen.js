import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import SearchBar from '../../components/SearchBar';
import Modal from '../../components/Modal';
import { api, isBackendConfigured } from '../../services/api';
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUNDS,
  loadNotificationSound,
  playNotificationSound,
  saveNotificationSound,
} from '../../services/sound';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import { hasRole } from '../../utils/permissions';

const USERNAME_RE = /^[a-zA-Z0-9._]+$/;
// Avatars are stored inside the employee row and returned with the directory,
// so they are downscaled before upload. The API accepts an 8 MB JSON body;
// leave room for the rest of the payload and the base64 envelope.
const MAX_PHOTO_DATA_URL = 6_000_000;
const AVATAR_MAX_WIDTH = 512;

const normalizeEmployee = (employee) => {
  // The directory endpoint has changed shape over time (camelCase vs snake_case
  // and org names with/without the `orgUnit` prefix), so read every known
  // variant instead of assuming one server version.
  const unitKind = employee.unitKind || employee.orgUnitKind || '';
  const unitName =
    employee.unitName ||
    employee.unit_name ||
    employee.orgUnitName ||
    employee.orgUnitNameAr ||
    employee.org_unit_name ||
    '';
  const parentUnitName =
    employee.parentUnitName ||
    employee.parentUnitNameAr ||
    employee.parent_unit_name ||
    '';
  const management =
    employee.management ||
    (unitKind === 'section' || unitKind === 'group' ? parentUnitName : '') ||
    unitName;

  return {
    id: employee.id,
    name:
      employee.name ||
      employee.fullNameAr ||
      employee.full_name_ar ||
      '',
    nameEn: employee.nameEn || employee.full_name_en || '',
    username: employee.username || null,
    management,
    unitName,
    unitId:
      employee.unitId ||
      employee.orgUnitId ||
      employee.org_unit_id ||
      '',
    jobTitle:
      employee.jobTitle ||
      employee.jobTitleAr ||
      employee.job_title_ar ||
      '',
    avatarUrl: employee.avatarUrl || employee.avatar_url || '',
  };
};

const normalizeMockContact = (contact) => ({
  id: contact.id,
  name: contact.name || '',
  nameEn: '',
  username: contact.username || null,
  management: contact.management || '',
  unitName: contact.unitName || '',
  unitId: contact.unitId || '',
  jobTitle: '',
  avatarUrl: contact.avatarUrl || '',
});

const InfoRow = ({ label, value, onPress, styles, small }) => {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={styles.infoRow}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.infoRowTop}>
        <Text style={[styles.infoLabel, small && styles.infoLabelSmall]}>{label}</Text>
        <Ionicons name="create-outline" size={14} color={colors.textLight} />
      </View>
      <Text
        style={[styles.infoValue, small && styles.infoValueSmall]}
        numberOfLines={2}
      >
        {value || '—'}
      </Text>
    </Pressable>
  );
};

const PhotoField = ({ value, onChange, onPick, disabled, styles, t }) => {
  const { colors } = useTheme();
  const isData = typeof value === 'string' && value.startsWith('data:');

  return (
    <View style={styles.photoField}>
      <Pressable
        onPress={disabled ? undefined : onPick}
        disabled={disabled}
        style={styles.photoAvatarButton}
        accessibilityRole="button"
        accessibilityLabel={t('settings.choosePhoto')}
      >
        <View style={styles.photoAvatarRing}>
          <UserAvatar
            person={{ avatar: value || null }}
            size="xlarge"
            style={styles.photoAvatarImage}
          />
        </View>
        {!disabled && (
          <View style={styles.photoCameraBadge}>
            <Ionicons name="camera" size={16} color={colors.textWhite} />
          </View>
        )}
      </Pressable>

      <Text style={styles.photoLabel}>{t('settings.photoLabel')}</Text>
      <Text style={styles.photoHint} numberOfLines={2}>
        {isData ? t('settings.photoFromGallery') : t('settings.photoHint')}
      </Text>

      {!disabled && (
        <View style={styles.photoActions}>
          <CustomButton
            title={t('settings.choosePhoto')}
            onPress={onPick}
            variant="outline"
            size="small"
            icon="images-outline"
            style={styles.photoButton}
          />
          {!!value && (
            <CustomButton
              title={t('settings.removePhoto')}
              onPress={() => onChange('')}
              variant="outline"
              size="small"
              icon="trash-outline"
              style={styles.photoButton}
            />
          )}
        </View>
      )}
    </View>
  );
};

const OrgTrigger = ({ label, value, placeholder, onPress, disabled, styles, align }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.orgField}>
      <Text style={[styles.orgFieldLabel, { textAlign: align }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.orgTrigger, disabled && styles.orgTriggerDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.orgTriggerValue,
            { textAlign: align },
            !value && styles.orgTriggerPlaceholder,
          ]}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
};

const SettingsScreen = ({ navigation }) => {
  const { width, height } = useWindowDimensions();
  const { user, logout, updateUser, refreshUser } = useAuth();
  const { t, language, setLanguage, isRTL, align } = useLanguage();
  const { colors, themeMode, setThemeMode } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const isAdmin = hasRole(user, 'admin');

  const [kitchens, setKitchens] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [orgTree, setOrgTree] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [contactsError, setContactsError] = useState(null);
  const [kitchensAreReal, setKitchensAreReal] = useState(false);
  const [contactsAreReal, setContactsAreReal] = useState(false);
  const [orgIsReal, setOrgIsReal] = useState(false);

  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKitchen, setSelectedKitchen] = useState(null);
  const [savingKitchenId, setSavingKitchenId] = useState(null);
  const [savingContacts, setSavingContacts] = useState(false);
  const [status, setStatus] = useState(null);
  const statusTimer = useRef(null);
  const [notificationSound, setNotificationSound] = useState(
    DEFAULT_NOTIFICATION_SOUND
  );

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullNameAr: '',
    username: '',
    management: '',
    office: '',
    orgUnitId: '',
    orgPath: '',
    avatarUrl: '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);

  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({
    fullNameAr: '',
    username: '',
    management: '',
    orgUnitId: '',
    orgPath: '',
    avatarUrl: '',
  });
  const [contactErrors, setContactErrors] = useState({});
  const [contactSaving, setContactSaving] = useState(false);
  const [contactReadOnly, setContactReadOnly] = useState(false);
  const activeContactId = useRef(null);

  const [orgPickerVisible, setOrgPickerVisible] = useState(false);
  const [orgPickerTarget, setOrgPickerTarget] = useState('profile');
  const [orgQuery, setOrgQuery] = useState('');
  const [expandedOrgIds, setExpandedOrgIds] = useState(() => new Set());
  const [orgReturnTo, setOrgReturnTo] = useState(null);

  const showStatus = useCallback((type, message) => {
    setStatus({ type, message });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 4500);
  }, []);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    loadNotificationSound().then((sound) => {
      if (!cancelled) setNotificationSound(sound);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setSelectedContacts(Array.isArray(user.contacts) ? user.contacts : []);
    setSelectedKitchen(user.kitchenChoice || null);
  }, [user]);

  // Keep the app language aligned with the language stored on the account.
  useEffect(() => {
    if (user?.language && user.language !== language) {
      setLanguage(user.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.language]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setContactsError(null);

    let nextKitchens = [];
    let nextContacts = [];
    let nextTree = [];
    let kitchensReal = false;
    let contactsReal = false;
    let orgReal = false;

    if (isBackendConfigured()) {
      const [kitchenResult, employeeResult, orgResult] = await Promise.allSettled([
        api.kitchens.getAll(),
        api.employees.getAll(),
        api.org.getTree(),
      ]);

      if (kitchenResult.status === 'fulfilled' && Array.isArray(kitchenResult.value)) {
        nextKitchens = kitchenResult.value;
        kitchensReal = true;
      }

      if (employeeResult.status === 'fulfilled' && Array.isArray(employeeResult.value)) {
        nextContacts = employeeResult.value.map(normalizeEmployee);
        contactsReal = true;
      } else if (employeeResult.status === 'rejected') {
        setContactsError(
          employeeResult.reason?.message || 'settings.contactsLoadError'
        );
      }

      if (orgResult.status === 'fulfilled' && Array.isArray(orgResult.value)) {
        nextTree = orgResult.value;
        orgReal = true;
      }
    }

    if (!kitchensReal) nextKitchens = mockData.kitchens;
    if (!contactsReal) nextContacts = mockData.availableContacts.map(normalizeMockContact);
    if (!orgReal) nextTree = [mockData.orgTree];

    setKitchens(nextKitchens);
    setContacts(nextContacts);
    setOrgTree(nextTree);
    setKitchensAreReal(kitchensReal);
    setContactsAreReal(contactsReal);
    setOrgIsReal(orgReal);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const orgIndex = useMemo(() => {
    const entries = new Map();
    const arrow = isRTL ? '\u2190' : '\u2192';

    const visit = (nodes, depth, parentPath, parentId = null, ancestors = []) => {
      const ids = [];
      for (const unit of nodes || []) {
        const name = localizeText(
          unit.nameAr || unit.nameEn || unit.name || unit.code || ''
        );
        const path = parentPath ? `${parentPath} ${arrow} ${name}` : name;
        const childIds = (unit.children || []).map((child) => child.id);
        const kind = unit.kind || '';
        const chain = [...ancestors, { name, kind }];

        // Management is the nearest directorate (إدارة) ancestor, falling back
        // to an office/deputy/root ancestor. Office is the selected unit itself
        // — e.g. "قسم البرمجة" under "إدارة المعلوماتية" yields management =
        // "إدارة المعلوماتية" and office = "قسم البرمجة".
        const directorate = [...chain]
          .reverse()
          .find((ancestor) => ancestor.kind === 'directorate');
        const fallback = [...chain]
          .reverse()
          .find((ancestor) => ['office', 'deputy', 'root'].includes(ancestor.kind));
        const management = (directorate || fallback || chain[chain.length - 1]).name;

        entries.set(unit.id, {
          id: unit.id,
          name,
          path,
          depth,
          parentId,
          kind,
          management,
          office: name,
          childIds,
          hasChildren: childIds.length > 0,
          searchText: [unit.nameAr, unit.nameEn, unit.code, name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        });

        ids.push(unit.id);
        visit(unit.children, depth + 1, path, unit.id, chain);
      }
      return ids;
    };

    return { entries, rootIds: visit(orgTree, 0, '') };
  }, [orgTree, isRTL, language]);

  const resolveOrgEntry = useCallback(
    (unitId) => (unitId ? orgIndex.entries.get(unitId) || null : null),
    [orgIndex]
  );

  const orgRows = useMemo(() => {
    const query = orgQuery.trim().toLowerCase();

    if (query) {
      return Array.from(orgIndex.entries.values()).filter((entry) =>
        entry.searchText.includes(query)
      );
    }

    const rows = [];
    const walk = (ids) => {
      for (const id of ids) {
        const entry = orgIndex.entries.get(id);
        if (!entry) continue;
        rows.push(entry);
        if (expandedOrgIds.has(id)) walk(entry.childIds);
      }
    };

    walk(orgIndex.rootIds);
    return rows;
  }, [orgIndex, expandedOrgIds, orgQuery]);

  const selectedKitchenName = useMemo(() => {
    const current = kitchens.find(
      (kitchen) =>
        kitchen.id === selectedKitchen || kitchen.code === selectedKitchen
    );
    return current
      ? localizeText(current.name || current.nameAr || current.nameEn || '')
      : '';
  }, [kitchens, selectedKitchen, language]);

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return contacts;

    return contacts.filter((contact) => {
      const haystack = [
        contact.name,
        contact.nameEn,
        localizeText(contact.name),
        contact.management,
        contact.unitName,
        contact.username,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contacts, searchQuery, language]);

  const canEditContact = useCallback(
    (contact) => {
      if (!isBackendConfigured() || !contactsAreReal) return true;
      if (isAdmin) return true;
      if (!contact) return false;
      return (
        contact.id === user?.employeeId ||
        (!!contact.username && contact.username === user?.username)
      );
    },
    [contactsAreReal, isAdmin, user]
  );

  const validateIdentity = useCallback(
    (form, { requireUsername = true } = {}) => {
      const errors = {};
      const name = (form.fullNameAr || '').trim();
      // The API stores usernames in lowercase; validate the normalized value so
      // a user typing an uppercase letter does not get a false "invalid" error.
      const username = (form.username || '').trim().toLowerCase();

      if (!name) errors.fullNameAr = t('addUser.nameRequired');

      // Directory employees do not necessarily have a user account. In that
      // case the username is optional, but an existing one cannot be cleared.
      if (!username) {
        if (requireUsername) errors.username = t('validation.usernameRequired');
      } else if (username.length < 3) {
        errors.username = t('validation.usernameMin');
      } else if (username.length > 30) {
        errors.username = t('validation.usernameMax');
      } else if (!USERNAME_RE.test(username)) {
        errors.username = t('validation.usernameInvalid');
      }

      return errors;
    },
    [t]
  );

  const pickPhoto = useCallback(
    async (onPicked) => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showStatus('error', t('settings.photoPermissionMessage'));
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 1,
        });

        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        // Downscale before storing: the avatar is embedded in the employee row
        // and returned with the directory, so full-resolution photos would
        // bloat every login/profile/directory response.
        const manipulated = await manipulateAsync(
          asset.uri,
          asset.width && asset.width <= AVATAR_MAX_WIDTH
            ? []
            : [{ resize: { width: AVATAR_MAX_WIDTH } }],
          { compress: 0.7, format: SaveFormat.JPEG, base64: true }
        );

        const base64 = manipulated.base64;
        if (!base64) {
          showStatus('error', t('settings.photoPermissionError'));
          return;
        }

        const dataUrl = `data:image/jpeg;base64,${base64}`;
        if (dataUrl.length > MAX_PHOTO_DATA_URL) {
          showStatus('error', t('settings.photoTooLarge'));
          return;
        }

        onPicked(dataUrl);
      } catch (error) {
        showStatus('error', error.message || t('settings.photoPermissionError'));
      }
    },
    [showStatus, t]
  );

  const openProfileEditor = () => {
    const orgEntry = resolveOrgEntry(user?.unitId);
    setProfileForm({
      fullNameAr: user?.name || user?.fullNameAr || '',
      username: user?.username || '',
      management: orgEntry?.management || user?.management || '',
      office: orgEntry?.office || user?.office || user?.unitName || '',
      orgUnitId: user?.unitId || '',
      orgPath: orgEntry?.path || user?.path || user?.unitName || user?.management || '',
      avatarUrl: user?.avatarUrl || user?.avatar || '',
    });
    setProfileErrors({});
    setProfileModalVisible(true);
  };

  const handleSaveProfile = async () => {
    const errors = validateIdentity(profileForm);
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const name = profileForm.fullNameAr.trim();
    const username = profileForm.username.trim().toLowerCase();
    const avatarUrl = profileForm.avatarUrl || '';
    const currentAvatar = user?.avatarUrl || user?.avatar || '';

    // Send only what actually changed. This keeps the payload small when the
    // avatar is a large data URL. Management and office are derived from the
    // selected org unit on the server, so they are never sent as free text.
    const updates = {};
    if (name !== (user?.name || '')) updates.fullNameAr = name;
    if (username !== (user?.username || '')) updates.username = username;
    if (avatarUrl !== currentAvatar) updates.avatarUrl = avatarUrl || null;

    let orgSkipped = false;
    const orgChanged =
      !!profileForm.orgUnitId && profileForm.orgUnitId !== user?.unitId;

    if (orgChanged) {
      if (isBackendConfigured() && !orgIsReal) {
        orgSkipped = true;
      } else {
        const orgEntry = resolveOrgEntry(profileForm.orgUnitId);
        updates.orgUnitId = profileForm.orgUnitId;
        if (orgEntry) {
          updates.unitName = orgEntry.name;
          updates.path = orgEntry.path;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      setProfileModalVisible(false);
      showStatus(
        orgSkipped ? 'error' : 'success',
        orgSkipped
          ? t('settings.orgSaveUnavailable')
          : t('settings.saveSuccess')
      );
      return;
    }

    setProfileSaving(true);
    const result = await updateUser(updates, {
      localOnly: !isBackendConfigured(),
    });
    setProfileSaving(false);

    if (result.success) {
      setProfileModalVisible(false);
      showStatus(
        'success',
        orgSkipped ? t('settings.orgSaveUnavailable') : t('settings.saveSuccess')
      );
    } else {
      showStatus('error', result.error || t('settings.saveError'));
    }
  };

  const openContactEditor = async (contact) => {
    if (!contact) return;

    activeContactId.current = contact.id;
    setEditingContact(contact);
    setContactForm({
      fullNameAr: contact.name || '',
      username: contact.username || '',
      management: contact.management || '',
      orgUnitId: contact.unitId || '',
      orgPath:
        resolveOrgEntry(contact.unitId)?.path ||
        contact.unitName ||
        contact.management ||
        '',
      avatarUrl: contact.avatarUrl || '',
    });
    setContactErrors({});
    setContactReadOnly(!canEditContact(contact));
    setContactModalVisible(true);

    if (isBackendConfigured() && contactsAreReal) {
      try {
        const fresh = await api.employees.getById(contact.id);
        if (!fresh || activeContactId.current !== contact.id) return;
        const normalized = normalizeEmployee(fresh);

        setEditingContact((current) =>
          current && current.id === contact.id
            ? { ...current, ...normalized }
            : current
        );
        setContactForm((current) => ({
          ...current,
          fullNameAr: normalized.name || current.fullNameAr,
          username: normalized.username || '',
          management: normalized.management || '',
          orgUnitId: normalized.unitId || '',
          orgPath:
            resolveOrgEntry(normalized.unitId)?.path ||
            normalized.unitName ||
            normalized.management ||
            '',
          avatarUrl: normalized.avatarUrl || '',
        }));
      } catch (error) {
        // Keep the row data we already have; the PATCH will surface any real
        // authorization/save error.
      }
    }
  };

  const handleSaveContact = async () => {
    if (!editingContact || contactReadOnly) return;

    const errors = validateIdentity(contactForm, {
      requireUsername: !!editingContact.username,
    });
    setContactErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const name = contactForm.fullNameAr.trim();
    const username = contactForm.username.trim().toLowerCase();
    const management = contactForm.management.trim();
    const avatarUrl = contactForm.avatarUrl || '';

    const updates = {};
    if (name !== (editingContact.name || '')) updates.fullNameAr = name;
    // Employees without a user account have no username to update.
    if (username && username !== (editingContact.username || '')) {
      updates.username = username;
    }
    if (management !== (editingContact.management || '')) {
      updates.management = management || null;
    }
    if (avatarUrl !== (editingContact.avatarUrl || '')) {
      updates.avatarUrl = avatarUrl || null;
    }

    let orgSkipped = false;
    const orgChanged =
      !!contactForm.orgUnitId && contactForm.orgUnitId !== editingContact.unitId;

    if (orgChanged) {
      if (isBackendConfigured() && !orgIsReal) {
        orgSkipped = true;
      } else {
        const orgEntry = resolveOrgEntry(contactForm.orgUnitId);
        updates.orgUnitId = contactForm.orgUnitId;
        if (orgEntry) {
          updates.unitName = orgEntry.name;
          updates.path = orgEntry.path;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      setContactModalVisible(false);
      showStatus(
        orgSkipped ? 'error' : 'success',
        orgSkipped
          ? t('settings.orgSaveUnavailable')
          : t('settings.contactSaved')
      );
      return;
    }

    setContactSaving(true);
    try {
      if (isBackendConfigured() && contactsAreReal) {
        const updated = await api.employees.update(editingContact.id, updates);
        if (updated) {
          const normalized = normalizeEmployee(updated);
          setContacts((prev) =>
            prev.map((contact) =>
              contact.id === normalized.id
                ? { ...contact, ...normalized }
                : contact
            )
          );
        }
      } else {
        const orgEntry = resolveOrgEntry(contactForm.orgUnitId);
        setContacts((prev) =>
          prev.map((contact) =>
            contact.id === editingContact.id
              ? {
                  ...contact,
                  name,
                  username,
                  management: management || contact.management,
                  avatarUrl,
                  unitId: updates.orgUnitId || contact.unitId,
                  unitName: orgEntry?.name || contact.unitName,
                }
              : contact
          )
        );
      }

      if (editingContact.id === user?.employeeId) {
        try {
          await refreshUser();
        } catch {
          // The account itself was saved; a stale profile snapshot is not fatal.
        }
      }

      setContactModalVisible(false);
      showStatus(
        'success',
        orgSkipped ? t('settings.orgSaveUnavailable') : t('settings.contactSaved')
      );
    } catch (error) {
      showStatus('error', error.message || t('settings.contactSaveError'));
    } finally {
      setContactSaving(false);
    }
  };

  const handleSelectKitchen = async (kitchen) => {
    if (!kitchen || savingKitchenId) return;

    const previous = selectedKitchen;
    setSelectedKitchen(kitchen.id);
    setSavingKitchenId(kitchen.id);

    const result = await updateUser(
      { kitchenChoice: kitchen.id },
      { localOnly: !kitchensAreReal }
    );

    setSavingKitchenId(null);

    if (result.success) {
      showStatus('success', t('settings.kitchenSaved'));
    } else {
      setSelectedKitchen(previous);
      showStatus('error', result.error || t('settings.kitchenSaveError'));
    }
  };

  const toggleContact = (contactId) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAllContacts = () => {
    const ids = filteredContacts.map((contact) => contact.id);
    setSelectedContacts((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const selectNoContacts = () => {
    const ids = new Set(filteredContacts.map((contact) => contact.id));
    setSelectedContacts((prev) => prev.filter((id) => !ids.has(id)));
  };

  const handleSaveContacts = async () => {
    // Only send ids the current directory actually returned. This avoids
    // replaying stale/mock ids if the fallback data was used earlier.
    const payload = contactsAreReal
      ? selectedContacts.filter((id) =>
          contacts.some((contact) => contact.id === id)
        )
      : selectedContacts;

    setSavingContacts(true);
    const result = await updateUser(
      { contacts: payload },
      { localOnly: !contactsAreReal }
    );
    setSavingContacts(false);

    if (result.success) {
      showStatus('success', t('settings.saveSuccess'));
    } else {
      showStatus('error', result.error || t('settings.saveError'));
    }
  };

  const handleToggleLanguage = async () => {
    const next = language === 'ar' ? 'en' : 'ar';
    const previous = language;

    setLanguage(next);
    const result = await updateUser(
      { language: next },
      { localOnly: !isBackendConfigured() }
    );

    if (!result.success) {
      setLanguage(previous);
      showStatus('error', result.error || t('settings.saveError'));
    } else {
      showStatus('success', t('settings.saveSuccess'));
    }
  };

  const handleSelectTheme = async (mode) => {
    if (themeMode === mode) return;
    const previous = themeMode;

    await setThemeMode(mode);
    const result = await updateUser(
      { theme: mode },
      { localOnly: !isBackendConfigured() }
    );

    if (!result.success) {
      await setThemeMode(previous);
      showStatus('error', result.error || t('settings.saveError'));
    } else {
      showStatus('success', t('settings.themeSaved'));
    }
  };

  const handleSelectNotificationSound = async (key) => {
    setNotificationSound(key);
    await saveNotificationSound(key);

    if (key !== 'silent') {
      playNotificationSound(key);
    }

    showStatus('success', t('settings.notificationSoundSaved'));
  };

  const openOrgPicker = (target) => {
    const currentId =
      target === 'contact' ? contactForm.orgUnitId : profileForm.orgUnitId;

    const expanded = new Set(orgIndex.rootIds);
    let current = currentId ? orgIndex.entries.get(currentId) : null;
    while (current) {
      expanded.add(current.id);
      current = current.parentId
        ? orgIndex.entries.get(current.parentId)
        : null;
    }

    setOrgPickerTarget(target);
    setOrgReturnTo(target);
    setOrgQuery('');
    setExpandedOrgIds(expanded);

    if (target === 'contact') setContactModalVisible(false);
    else setProfileModalVisible(false);

    setOrgPickerVisible(true);
  };

  const closeOrgPicker = () => {
    setOrgPickerVisible(false);
    if (orgReturnTo === 'contact') setContactModalVisible(true);
    else if (orgReturnTo === 'profile') setProfileModalVisible(true);
    setOrgReturnTo(null);
    setOrgQuery('');
  };

  const selectOrgUnit = (unitId) => {
    const entry = orgIndex.entries.get(unitId);

    if (entry) {
      if (orgPickerTarget === 'contact') {
        setContactForm((prev) => ({
          ...prev,
          orgUnitId: unitId,
          orgPath: entry.path,
        }));
      } else {
        setProfileForm((prev) => ({
          ...prev,
          orgUnitId: unitId,
          orgPath: entry.path,
          // Management and office are derived from the selected position and
          // shown read-only; the server recomputes them from the hierarchy.
          management: entry.management || prev.management,
          office: entry.office || prev.office,
        }));
      }
    }

    setOrgPickerVisible(false);
    if (orgPickerTarget === 'contact') setContactModalVisible(true);
    else setProfileModalVisible(true);
    setOrgReturnTo(null);
    setOrgQuery('');
  };

  const toggleOrgUnit = (unitId) => {
    setExpandedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const profileAvatar = user?.avatarUrl || user?.avatar;
  const profileName = user?.name || user?.fullNameAr || user?.username || '—';
  const profileManagement = user?.management || user?.unitName;
  const profileOffice = user?.office || user?.unitName;
  const profileOrgPath = user?.path || user?.unitName || user?.management;

  const avatarSize = isSmallScreen ? 'medium' : isLargeScreen ? 'xlarge' : 'large';
  const sectionPadding = isSmallScreen
    ? spacing.sm
    : isLargeScreen
      ? spacing.xl
      : spacing.md;
  const headerPadding = isSmallScreen
    ? spacing.sm
    : isLargeScreen
      ? spacing.xl
      : spacing.md;

  const activeOrgId =
    orgPickerTarget === 'contact' ? contactForm.orgUnitId : profileForm.orgUnitId;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isLandscape && styles.scrollContentLandscape,
        ]}
      >
        {/* الهيدر */}
        <View style={[styles.header, { padding: headerPadding }]}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <View>
              <Text style={[styles.title, isSmallScreen && styles.titleSmall]}>
                {t('settings.title')}
              </Text>
              <Text
                style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}
              >
                {t('settings.subtitle')}
              </Text>
            </View>
          </View>
        </View>

        {/* حسابي */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <Text
            style={[
              styles.sectionTitle,
              isSmallScreen && styles.sectionTitleSmall,
            ]}
          >
            {t('settings.myAccount')}
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              isSmallScreen && styles.sectionDescriptionSmall,
            ]}
          >
            {t('settings.editProfileHint')}
          </Text>

          <View style={styles.profileCard}>
            <View style={styles.profileBanner}>
              <View style={styles.profileBannerOrb} />
              <View style={styles.profileBannerOrbSmall} />
            </View>

            <Pressable
              onPress={openProfileEditor}
              style={styles.profileAvatarWrap}
              accessibilityRole="button"
              accessibilityLabel={t('settings.editProfile')}
            >
              <View style={styles.profileAvatarRing}>
                <UserAvatar
                  person={{
                    ...user,
                    avatarUrl: profileAvatar || null,
                    avatar: profileAvatar || null,
                  }}
                  size={avatarSize}
                  style={styles.profileAvatarImage}
                />
              </View>
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={13} color={colors.textWhite} />
              </View>
            </Pressable>

            <Text style={styles.profileName} numberOfLines={2}>
              {profileName}
            </Text>

            {!!user?.username && (
              <View style={styles.profileUsernamePill}>
                <Ionicons name="at" size={13} color={colors.primaryLight} />
                <Text style={styles.profileUsername}>{user.username}</Text>
              </View>
            )}

            <View style={styles.profileMeta}>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaIcon}>
                  <Ionicons
                    name="business-outline"
                    size={16}
                    color={colors.primaryLight}
                  />
                </View>
                <View style={styles.profileMetaBody}>
                  <Text style={styles.profileMetaLabel}>
                    {t('settings.managementLabel')}
                  </Text>
                  <Text style={styles.profileMetaValue} numberOfLines={2}>
                    {profileManagement || '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaIcon}>
                  <Ionicons
                    name="grid-outline"
                    size={16}
                    color={colors.primaryLight}
                  />
                </View>
                <View style={styles.profileMetaBody}>
                  <Text style={styles.profileMetaLabel}>
                    {t('settings.officeLabel')}
                  </Text>
                  <Text style={styles.profileMetaValue} numberOfLines={2}>
                    {profileOffice || '—'}
                  </Text>
                </View>
              </View>

              {!!profileOrgPath && (
                <View style={styles.profilePathRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.textLight}
                  />
                  <Text style={styles.profilePath} numberOfLines={2}>
                    {profileOrgPath}
                  </Text>
                </View>
              )}
            </View>

            <CustomButton
              title={t('settings.editProfile')}
              onPress={openProfileEditor}
              icon="create-outline"
              size="small"
              style={styles.profileEditButton}
            />
          </View>
        </View>

        {/* مطبخ الخدمة */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <Text
            style={[
              styles.sectionTitle,
              isSmallScreen && styles.sectionTitleSmall,
            ]}
          >
            {t('settings.kitchenTitle')}
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              isSmallScreen && styles.sectionDescriptionSmall,
            ]}
          >
            {t('settings.kitchenDescription')}
          </Text>

          <View style={styles.currentKitchenRow}>
            <Ionicons
              name="restaurant-outline"
              size={16}
              color={colors.warning}
            />
            <Text style={[styles.currentKitchenLabel, { textAlign: align }]}>
              {t('settings.currentKitchen')}
            </Text>
            <Text
              style={[styles.currentKitchenValue, { textAlign: align }]}
              numberOfLines={2}
            >
              {selectedKitchenName || t('settings.notSelected')}
            </Text>
          </View>

          {dataLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={colors.primaryLight} />
            </View>
          ) : kitchens.length === 0 ? (
            <Text style={[styles.emptyText, { textAlign: align }]}>
              {t('common.noOptions')}
            </Text>
          ) : (
            <View style={styles.kitchenOptions}>
              {kitchens.map((kitchen) => {
                const isSelected =
                  selectedKitchen === kitchen.id ||
                  selectedKitchen === kitchen.code;
                const isSaving = savingKitchenId === kitchen.id;

                return (
                  <Pressable
                    key={kitchen.id}
                    style={[
                      styles.kitchenOption,
                      isSelected && styles.kitchenOptionSelected,
                    ]}
                    onPress={() => handleSelectKitchen(kitchen)}
                    disabled={!!savingKitchenId}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.kitchenRadio}>
                      {isSelected && <View style={styles.kitchenRadioSelected} />}
                    </View>
                    <View style={styles.kitchenInfo}>
                      <Text
                        style={[
                          styles.kitchenName,
                          isSmallScreen && styles.kitchenNameSmall,
                        ]}
                      >
                        {localizeText(
                          language === 'en'
                            ? kitchen.nameEn || kitchen.name || kitchen.nameAr
                            : kitchen.name || kitchen.nameAr || kitchen.nameEn
                        )}
                      </Text>
                      {!!(kitchen.scope || kitchen.scopeEn || kitchen.path || kitchen.nameEn) && (
                        <Text
                          style={[
                            styles.kitchenPath,
                            { textAlign: align },
                          ]}
                          numberOfLines={2}
                        >
                          {localizeText(
                            language === 'en'
                              ? kitchen.scopeEn ||
                                  kitchen.scope ||
                                  kitchen.path ||
                                  kitchen.nameEn ||
                                  ''
                              : kitchen.scope ||
                                  kitchen.path ||
                                  kitchen.scopeEn ||
                                  kitchen.nameEn ||
                                  ''
                          )}
                        </Text>
                      )}
                    </View>
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.warning} />
                    ) : isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.warning}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* المظهر */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <Text
            style={[
              styles.sectionTitle,
              isSmallScreen && styles.sectionTitleSmall,
            ]}
          >
            {t('settings.themeTitle')}
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              isSmallScreen && styles.sectionDescriptionSmall,
            ]}
          >
            {t('settings.themeDescription')}
          </Text>
          <View style={styles.themeOptions}>
            {[
              { mode: 'light', icon: 'sunny-outline', label: 'settings.lightMode' },
              { mode: 'dark', icon: 'moon-outline', label: 'settings.darkMode' },
            ].map((option) => {
              const isSelected = themeMode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  style={[
                    styles.themeOption,
                    isSelected && styles.themeOptionSelected,
                  ]}
                  onPress={() => handleSelectTheme(option.mode)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.themeOptionIcon}>
                    <Ionicons
                      name={option.icon}
                      size={isSmallScreen ? 16 : 20}
                      color={colors.primaryLight}
                    />
                  </View>
                  <Text
                    style={[
                      styles.themeOptionLabel,
                      isSmallScreen && styles.themeOptionLabelSmall,
                    ]}
                  >
                    {t(option.label)}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={isSmallScreen ? 18 : 20}
                      color={colors.primaryLight}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* نغمة الإشعارات */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <Text
            style={[
              styles.sectionTitle,
              isSmallScreen && styles.sectionTitleSmall,
            ]}
          >
            {t('settings.notificationSoundTitle')}
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              isSmallScreen && styles.sectionDescriptionSmall,
            ]}
          >
            {t('settings.notificationSoundDescription')}
          </Text>

          <View style={styles.soundOptions}>
            {NOTIFICATION_SOUNDS.map((option) => {
              const isSelected = notificationSound === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.soundOption,
                    isSelected && styles.soundOptionSelected,
                  ]}
                  onPress={() => handleSelectNotificationSound(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.soundIcon,
                      isSelected && styles.soundIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={isSmallScreen ? 16 : 18}
                      color={isSelected ? colors.textWhite : colors.primaryLight}
                    />
                  </View>

                  <View style={styles.soundInfo}>
                    <Text
                      style={[
                        styles.soundLabel,
                        isSmallScreen && styles.soundLabelSmall,
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                    <Text
                      style={styles.soundHint}
                      numberOfLines={1}
                    >
                      {t(option.descriptionKey)}
                    </Text>
                  </View>

                  <Ionicons
                    name={
                      isSelected
                        ? 'checkmark-circle'
                        : option.key === 'silent'
                          ? 'volume-mute-outline'
                          : 'play-circle-outline'
                    }
                    size={isSmallScreen ? 18 : 20}
                    color={isSelected ? colors.primaryLight : colors.textLight}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* اللغة */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <Text
            style={[
              styles.sectionTitle,
              isSmallScreen && styles.sectionTitleSmall,
            ]}
          >
            {t('settings.languageTitle')}
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              isSmallScreen && styles.sectionDescriptionSmall,
            ]}
          >
            {t('settings.languageDescription')}
          </Text>
          <Pressable
            style={styles.languageRow}
            onPress={handleToggleLanguage}
            accessibilityRole="button"
          >
            <View style={styles.languageIcon}>
              <Ionicons
                name="language"
                size={isSmallScreen ? 16 : 20}
                color={colors.primaryLight}
              />
            </View>
            <View style={styles.languageInfo}>
              <Text
                style={[
                  styles.languageValue,
                  isSmallScreen && styles.languageValueSmall,
                ]}
              >
                {language === 'ar' ? t('settings.arabic') : t('settings.english')}
              </Text>
            </View>
            <Ionicons
              name={isRTL ? 'chevron-back' : 'chevron-forward'}
              size={isSmallScreen ? 16 : 20}
              color={colors.textLight}
            />
          </Pressable>
        </View>

        {/* إدارة المستخدمين - تظهر فقط لمدير النظام */}
        {isAdmin && (
          <View style={[styles.section, { padding: sectionPadding }]}>
            <Text
              style={[
                styles.sectionTitle,
                isSmallScreen && styles.sectionTitleSmall,
              ]}
            >
              {t('addUser.title')}
            </Text>
            <Pressable
              style={styles.languageRow}
              onPress={() => navigation.navigate('AddUser')}
            >
              <View style={styles.languageIcon}>
                <Ionicons
                  name="person-add"
                  size={isSmallScreen ? 16 : 20}
                  color={colors.primaryLight}
                />
              </View>
              <View style={styles.languageInfo}>
                <Text
                  style={[
                    styles.languageValue,
                    isSmallScreen && styles.languageValueSmall,
                  ]}
                >
                  {t('addUser.entry')}
                </Text>
              </View>
              <Ionicons
                name={isRTL ? 'chevron-back' : 'chevron-forward'}
                size={isSmallScreen ? 16 : 20}
                color={colors.textLight}
              />
            </Pressable>
          </View>
        )}

        {/* تسجيل الخروج */}
        <View style={[styles.section, { padding: sectionPadding }]}>
          <CustomButton
            title={t('settings.logout')}
            onPress={logout}
            variant="danger"
            icon="log-out"
            style={styles.logoutButton}
            size="small"
          />
        </View>
      </ScrollView>

      {status && (
        <View
          style={[
            styles.statusBanner,
            status.type === 'error' ? styles.statusError : styles.statusSuccess,
          ]}
        >
          <Ionicons
            name={
              status.type === 'error'
                ? 'alert-circle-outline'
                : 'checkmark-circle-outline'
            }
            size={18}
            color={status.type === 'error' ? colors.danger : colors.success}
          />
          <Text
            style={[
              styles.statusText,
              status.type === 'error'
                ? styles.statusTextError
                : styles.statusTextSuccess,
            ]}
          >
            {status.message}
          </Text>
        </View>
      )}

      {/* تعديل بيانات حسابي */}
      <Modal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        title={t('settings.editProfile')}
        size="medium"
        style={[styles.formModal, { maxHeight: height * 0.9 }]}
      >
        <ScrollView
          style={[styles.modalScroll, { maxHeight: height * 0.64 }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <PhotoField
            value={profileForm.avatarUrl}
            onChange={(value) =>
              setProfileForm((prev) => ({ ...prev, avatarUrl: value }))
            }
            onPick={() =>
              pickPhoto((uri) =>
                setProfileForm((prev) => ({ ...prev, avatarUrl: uri }))
              )
            }
            disabled={false}
            styles={styles}
            t={t}
          />

          <View style={styles.formFields}>
            <CustomInput
              label={t('settings.nameLabel')}
              value={profileForm.fullNameAr}
              onChangeText={(value) =>
                setProfileForm((prev) => ({ ...prev, fullNameAr: value }))
              }
              placeholder={t('settings.namePlaceholder')}
              required
              error={profileErrors.fullNameAr}
              icon="person-outline"
            />

            <CustomInput
              label={t('settings.usernameLabel')}
              value={profileForm.username}
              onChangeText={(value) =>
                setProfileForm((prev) => ({ ...prev, username: value }))
              }
              placeholder={t('settings.usernamePlaceholder')}
              required
              error={profileErrors.username}
              hint={t('addUser.usernameHint')}
              icon="at-outline"
            />

            <OrgTrigger
              label={t('settings.orgPathLabel')}
              value={profileForm.orgPath}
              placeholder={t('settings.orgPlaceholder')}
              onPress={() => openOrgPicker('profile')}
              styles={styles}
              align={align}
            />

            <Text style={styles.orgHelper}>
              {t('settings.orgAutoFillHint')}
            </Text>

            <CustomInput
              label={t('settings.managementLabel')}
              value={profileForm.management}
              placeholder={t('settings.autoFilledHint')}
              icon="business-outline"
              disabled
              hint={t('settings.autoFilledHint')}
            />

            <CustomInput
              label={t('settings.officeLabel')}
              value={profileForm.office}
              placeholder={t('settings.autoFilledHint')}
              icon="grid-outline"
              disabled
              hint={t('settings.autoFilledHint')}
            />
          </View>

          <View style={styles.modalActions}>
            <CustomButton
              title={t('settings.saveChanges')}
              onPress={handleSaveProfile}
              loading={profileSaving}
              disabled={profileSaving}
              icon="checkmark-circle-outline"
              style={styles.modalButton}
            />
            <CustomButton
              title={t('common.cancel')}
              onPress={() => setProfileModalVisible(false)}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* منتقي الموقع في الهيكل الإداري */}
      <RNModal
        visible={orgPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOrgPicker}
        statusBarTranslucent
      >
        <View style={[styles.orgBackdrop, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeOrgPicker}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.orgSheetWrapper, { maxHeight: Math.round(height * 0.88) }]}
          >
            <SafeAreaView style={styles.orgSheet} edges={['bottom']}>
              <View style={styles.orgSheetHandle} />

              <View style={styles.orgSheetHeader}>
                <Text style={styles.orgSheetTitle}>
                  {t('settings.orgPickerTitle')}
                </Text>
                <Pressable
                  onPress={closeOrgPicker}
                  hitSlop={10}
                  style={styles.orgSheetClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <CustomInput
                value={orgQuery}
                onChangeText={setOrgQuery}
                placeholder={t('common.search')}
                icon="search"
                style={styles.orgSearch}
              />

              <ScrollView
                style={[
                  styles.orgTreeScroll,
                  { maxHeight: Math.max(160, Math.round(height * 0.55)) },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {orgRows.length === 0 ? (
                  <Text style={[styles.orgEmpty, { textAlign: align }]}>
                    {t('common.noOptions')}
                  </Text>
                ) : (
                  orgRows.map((row) => {
                    const isSelected = row.id === activeOrgId;
                    const isExpanded = expandedOrgIds.has(row.id);
                    const toggleIcon = isExpanded
                      ? 'chevron-down'
                      : isRTL
                        ? 'chevron-back'
                        : 'chevron-forward';

                    return (
                      <View
                        key={row.id}
                        style={[
                          styles.orgRow,
                          { paddingStart: spacing.sm + row.depth * spacing.md },
                          isSelected && styles.orgRowSelected,
                        ]}
                      >
                        {row.hasChildren ? (
                          <Pressable
                            onPress={() => toggleOrgUnit(row.id)}
                            hitSlop={8}
                            style={styles.orgRowToggle}
                            accessibilityRole="button"
                            accessibilityLabel={row.name}
                            accessibilityState={{ expanded: isExpanded }}
                          >
                            <Ionicons
                              name={toggleIcon}
                              size={16}
                              color={colors.textSecondary}
                            />
                          </Pressable>
                        ) : (
                          <View style={styles.orgRowToggleSpacer} />
                        )}

                        <Pressable
                          onPress={() => selectOrgUnit(row.id)}
                          style={styles.orgRowBody}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.orgRowName,
                              { textAlign: align },
                              isSelected && styles.orgRowNameSelected,
                            ]}
                          >
                            {row.name}
                          </Text>
                          {row.depth > 0 && (
                            <Text
                              numberOfLines={1}
                              style={[styles.orgRowPath, { textAlign: align }]}
                            >
                              {row.path}
                            </Text>
                          )}
                        </Pressable>

                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={colors.primaryLight}
                          />
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </RNModal>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  scrollContentLandscape: {
    paddingHorizontal: '15%',
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
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
  statusBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    ...shadows.md,
  },
  statusSuccess: {
    backgroundColor: colors.successLight,
    borderColor: colors.successBorder,
  },
  statusError: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerBorder,
  },
  statusText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
  statusTextSuccess: {
    color: colors.success,
  },
  statusTextError: {
    color: colors.danger,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    margin: spacing.sm,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionTitleSmall: {
    fontSize: 16,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  sectionDescriptionSmall: {
    fontSize: 11,
  },
  profileCard: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    paddingBottom: spacing.md,
  },
  profileBanner: {
    width: '100%',
    height: 96,
    backgroundColor: colors.surfaceDark,
    marginBottom: -52,
  },
  profileBannerOrb: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -56,
    right: -30,
  },
  profileBannerOrbSmall: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(196,165,106,0.18)',
    bottom: -18,
    left: 18,
  },
  profileAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  profileAvatarRing: {
    padding: 4,
    borderRadius: borderRadius.full,
    borderWidth: 3,
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  profileAvatarImage: {
    borderRadius: borderRadius.full,
  },
  profileName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  profileUsernamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight,
  },
  profileUsername: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  profileMeta: {
    width: '100%',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileMetaIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  profileMetaBody: {
    flex: 1,
    minWidth: 0,
  },
  profileMetaLabel: {
    ...typography.small,
    color: colors.textLight,
  },
  profileMetaValue: {
    ...typography.bodySmallBold,
    color: colors.text,
    marginTop: 1,
  },
  profilePathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  profilePath: {
    ...typography.small,
    color: colors.textLight,
    flex: 1,
  },
  profileEditButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 180,
  },
  avatarWrapper: {
    alignSelf: 'flex-start',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  infoRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  infoLabelSmall: {
    fontSize: 10,
  },
  infoValue: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 2,
  },
  infoValueSmall: {
    fontSize: 12,
  },
  inlineLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  currentKitchenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningSurface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  currentKitchenLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  currentKitchenValue: {
    ...typography.captionBold,
    color: colors.warningText,
    flex: 1,
  },
  kitchenOptions: {
    gap: spacing.sm,
  },
  kitchenOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
    borderColor: colors.warningBorder,
    padding: spacing.sm,
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
  },
  kitchenRadioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
  },
  kitchenInfo: {
    flex: 1,
    minWidth: 0,
  },
  kitchenName: {
    ...typography.bodyBold,
    color: colors.warningText,
  },
  kitchenNameSmall: {
    fontSize: 12,
  },
  kitchenPath: {
    ...typography.caption,
    color: colors.warningTextMuted,
    marginTop: 1,
  },
  contactsHeader: {
    marginBottom: spacing.sm,
  },
  searchBar: {
    marginBottom: spacing.sm,
  },
  contactsActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  actionButtonText: {
    ...typography.buttonSmall,
    color: colors.primaryLight,
  },
  actionButtonTextSmall: {
    fontSize: 11,
  },
  contactsList: {
    marginBottom: spacing.sm,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  contactItemSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectedSurface,
  },
  contactAvatar: {
    flexShrink: 0,
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactField: {
    paddingVertical: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  contactName: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  contactNameSmall: {
    fontSize: 13,
  },
  contactMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  contactMetaSmall: {
    fontSize: 10,
  },
  contactUsername: {
    ...typography.small,
    color: colors.primaryLight,
    marginTop: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryLight,
  },
  contactsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectedCount: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  selectedCountSmall: {
    fontSize: 12,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  warningText: {
    ...typography.caption,
    color: colors.warningText,
    flex: 1,
    lineHeight: 18,
  },
  retryText: {
    ...typography.captionBold,
    color: colors.primaryLight,
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  mockNoticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  themeOptions: {
    gap: spacing.sm,
  },
  soundOptions: {
    gap: spacing.sm,
  },
  soundOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  soundOptionSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectedSurface,
  },
  soundIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  soundIconSelected: {
    backgroundColor: colors.primaryLight,
  },
  soundInfo: {
    flex: 1,
    minWidth: 0,
  },
  soundLabel: {
    ...typography.bodyBold,
    color: colors.text,
  },
  soundLabelSmall: {
    fontSize: 13,
  },
  soundHint: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 1,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  themeOptionSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectedSurface,
  },
  themeOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.iconSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionLabel: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  themeOptionLabelSmall: {
    fontSize: 13,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  languageIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.iconSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageInfo: {
    flex: 1,
  },
  languageValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  languageValueSmall: {
    fontSize: 13,
  },
  logoutButton: {
    marginTop: spacing.xs,
  },
  formModal: {
    maxWidth: 520,
  },
  modalScroll: {
    paddingBottom: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalButton: {
    flex: 1,
  },
  formFields: {
    gap: spacing.xs,
  },
  photoField: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  photoAvatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  photoAvatarRing: {
    padding: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  photoAvatarImage: {
    borderRadius: 999,
  },
  photoCameraBadge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  photoLabel: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  photoHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: spacing.md,
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoButton: {
    minWidth: 120,
  },
  orgHelper: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  orgField: {
    marginBottom: spacing.md,
  },
  orgFieldLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  orgTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  orgTriggerDisabled: {
    backgroundColor: colors.background,
    opacity: 0.6,
  },
  orgTriggerValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  orgTriggerPlaceholder: {
    color: colors.textLight,
  },
  orgBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  orgSheetWrapper: {
    width: '100%',
  },
  orgSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  orgSheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderDark,
    marginBottom: spacing.sm,
  },
  orgSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  orgSheetTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  orgSheetClose: {
    padding: spacing.xs,
  },
  orgSearch: {
    marginBottom: spacing.xs,
  },
  orgTreeScroll: {
    marginBottom: spacing.sm,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orgRowSelected: {
    backgroundColor: colors.infoLight,
  },
  orgRowToggle: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgRowToggleSpacer: {
    width: 24,
  },
  orgRowBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  orgRowName: {
    ...typography.bodySmallBold,
    color: colors.text,
  },
  orgRowNameSelected: {
    color: colors.primaryLight,
  },
  orgRowPath: {
    ...typography.small,
    color: colors.textLight,
    marginTop: 1,
  },
  orgEmpty: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingVertical: spacing.lg,
  },
});

export default SettingsScreen;
