import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '../../components/AppText';
import SafeAreaView from '../../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../constants/typography';
import { spacing, borderRadius, shadows } from '../../constants/spacing';
import UserAvatar from '../../components/UserAvatar';
import SelectField from '../../components/SelectField';
import { FadeInView } from '../../components/Motion';
import CustomButton from '../../components/CustomButton';
import CustomInput from '../../components/CustomInput';
import SearchBar from '../../components/SearchBar';
import Modal from '../../components/Modal';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import { api, isBackendConfigured } from '../../services/api';
import { mockData } from '../../utils/mockData';
import { useLanguage } from '../../context/LanguageContext';
import { localizeText } from '../../i18n/localize';
import { flipStyles } from '../../i18n/rtlStyles';
import { hasRole } from '../../utils/permissions';
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUNDS,
  loadNotificationSound,
  playNotificationSound,
  saveNotificationSound,
} from '../../services/sound';

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

const SettingsScreen = () => {
  const { width, height } = useWindowDimensions();
  const { user, logout, updateUser, refreshUser } = useAuth();
  const { t, language, setLanguage, isRTL, align } = useLanguage();
  const { colors, themeMode, setThemeMode, isDarkMode } = useTheme();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const isSmallScreen = width < 375;
  const isLargeScreen = width > 768;
  const isLandscape = width > height;
  const isAdmin = hasRole(user, 'admin');

  const [contacts, setContacts] = useState([]);
  const [orgTree, setOrgTree] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [contactsError, setContactsError] = useState(null);
  const [contactsAreReal, setContactsAreReal] = useState(false);
  const [orgIsReal, setOrgIsReal] = useState(false);

  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationSound, setNotificationSound] = useState(DEFAULT_NOTIFICATION_SOUND);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);
  const [status, setStatus] = useState(null);
  const statusTimer = useRef(null);

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
    if (!user) return;
    setSelectedContacts(Array.isArray(user.contacts) ? user.contacts : []);
  }, [user]);

  // The notification tone is a per-device preference (not saved on the server).
  useEffect(() => {
    let cancelled = false;
    loadNotificationSound().then((sound) => {
      if (!cancelled) setNotificationSound(sound);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

    let nextContacts = [];
    let nextTree = [];
    let contactsReal = false;
    let orgReal = false;

    if (isBackendConfigured()) {
      const [employeeResult, orgResult] = await Promise.allSettled([
        api.employees.getAll(),
        api.org.getTree(),
      ]);

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

    if (!contactsReal) nextContacts = mockData.availableContacts.map(normalizeMockContact);
    if (!orgReal) nextTree = [mockData.orgTree];

    setContacts(nextContacts);
    setOrgTree(nextTree);
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

  const soundOptions = useMemo(
    () =>
      NOTIFICATION_SOUNDS.map((option) => ({
        value: option.key,
        icon: option.icon,
        label: t(option.labelKey),
        description: t(option.descriptionKey),
      })),
    // `t` changes with the language.
    [t]
  );

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

  // Choosing a tone saves it at once and plays it, so the list doubles as a
  // preview: the sheet stays open until the user closes it.
  const handleSelectNotificationSound = (key) => {
    setNotificationSound(key);
    saveNotificationSound(key);
    if (key !== 'silent') playNotificationSound(key);
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
  const profileUnitLine =
    profileOffice && profileManagement && profileOffice !== profileManagement
      ? `${profileManagement} \u00b7 ${profileOffice}`
      : profileManagement || profileOffice || '';

  const headerPadding = isSmallScreen
    ? spacing.sm
    : isLargeScreen
      ? spacing.xl
      : spacing.md;

  const activeOrgId =
    orgPickerTarget === 'contact' ? contactForm.orgUnitId : profileForm.orgUnitId;

  return (
    <SafeAreaView style={styles.container} animated>
      <ScrollView
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scrollContent,
          isLandscape && styles.scrollContentLandscape,
        ]}
      >
        {/* الهيدر: المظهر واللغة كأيقونات فقط */}
        <View style={[styles.header, { paddingHorizontal: headerPadding }]}>
          <View style={styles.headerTitle}>
            <View style={styles.titleBorder} />
            <Text
              style={[styles.title, isSmallScreen && styles.titleSmall]}
              accessibilityRole="header"
              numberOfLines={1}
            >
              {t('settings.title')}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => handleSelectTheme(isDarkMode ? 'light' : 'dark')}
              hitSlop={6}
              style={({ pressed }) => [styles.iconToggle, pressed && styles.iconTogglePressed]}
              accessibilityRole="button"
              accessibilityLabel={isDarkMode ? t('settings.lightMode') : t('settings.darkMode')}
            >
              <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={20} color={colors.primaryLight} />
            </Pressable>
            <Pressable
              onPress={handleToggleLanguage}
              hitSlop={6}
              style={({ pressed }) => [styles.iconToggle, pressed && styles.iconTogglePressed]}
              accessibilityRole="button"
              accessibilityLabel={language === 'ar' ? t('settings.english') : t('settings.arabic')}
            >
              <Text style={styles.langToggleText}>{language === 'ar' ? 'EN' : '\u0639'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.body, { paddingHorizontal: headerPadding }]}>
          {/* حسابي */}
          <FadeInView delay={0} style={[styles.card, styles.profileRow]}>
            <Pressable
              onPress={openProfileEditor}
              style={styles.profileAvatarWrap}
              accessibilityRole="button"
              accessibilityLabel={t('settings.editProfile')}
            >
              <UserAvatar
                person={{
                  ...user,
                  avatarUrl: profileAvatar || null,
                  avatar: profileAvatar || null,
                }}
                size="large"
              />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color={colors.textWhite} />
              </View>
            </Pressable>
            <View style={styles.profileText}>
              <Text style={styles.profileNameText} numberOfLines={1}>
                {profileName}
              </Text>
              {!!user?.username && (
                <Text style={styles.profileUsernameText} numberOfLines={1}>
                  @{user.username}
                </Text>
              )}
              {!!profileUnitLine && (
                <Text style={styles.profileUnitText} numberOfLines={1}>
                  {profileUnitLine}
                </Text>
              )}
            </View>
            <Pressable
              onPress={openProfileEditor}
              hitSlop={6}
              style={({ pressed }) => [styles.roundButton, pressed && styles.iconTogglePressed]}
              accessibilityRole="button"
              accessibilityLabel={t('settings.editProfile')}
            >
              <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
            </Pressable>
          </FadeInView>

          {/* نغمة الإشعارات */}
          <FadeInView delay={70} style={[styles.card, styles.prefCard]}>
            <SelectField
              value={notificationSound}
              options={soundOptions}
              onSelect={handleSelectNotificationSound}
              presentation="sheet"
              sheetTitle={t('settings.notificationSoundTitle')}
              closeOnSelect={false}
              style={styles.prefSelect}
              // One settings row: icon, title and the chosen tone.
              renderTrigger={({ onPress, selected, disabled }) => (
                <Pressable
                  onPress={onPress}
                  disabled={disabled}
                  style={({ pressed }) => [styles.prefRow, pressed && styles.listRowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.notificationSoundTitle')}
                  accessibilityHint={selected?.label}
                >
                  <View style={[styles.prefIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons
                      name={notificationSound === 'silent' ? 'volume-mute' : 'musical-notes'}
                      size={20}
                      color={colors.primaryLight}
                    />
                  </View>
                  <View style={styles.prefText}>
                    <Text style={styles.prefLabel}>{t('settings.notificationSoundTitle')}</Text>
                    <Text style={styles.prefValue} numberOfLines={1}>
                      {selected?.label}
                    </Text>
                  </View>
                  <Ionicons
                    name={isRTL ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={colors.textLight}
                  />
                </Pressable>
              )}
            />
          </FadeInView>

          {/* إجراءات */}
          <FadeInView delay={140} style={[styles.card, styles.listCard]}>
            <Pressable
              onPress={() => setPasswordModalVisible(true)}
              style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
              accessibilityRole="button"
            >
              <View style={[styles.cardIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.primaryLight} />
              </View>
              <Text style={styles.listRowLabel}>{t('settings.changePassword')}</Text>
              <Ionicons
                name={isRTL ? 'chevron-back' : 'chevron-forward'}
                size={18}
                color={colors.textLight}
              />
            </Pressable>
            <View style={styles.listDivider} />
            <Pressable
              onPress={logout}
              style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
              accessibilityRole="button"
            >
              <View style={[styles.cardIcon, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              </View>
              <Text style={[styles.listRowLabel, styles.listRowLabelDanger]}>
                {t('settings.logout')}
              </Text>
            </Pressable>
          </FadeInView>
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
          keyboardDismissMode="on-drag"
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

            {/* Only an admin may move an account between units: the unit
                decides who may call the Director and the Deputy. */}
            {isAdmin ? (
              <>
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
              </>
            ) : (
              <CustomInput
                label={t('settings.orgPathLabel')}
                value={profileForm.orgPath}
                placeholder={t('settings.orgPlaceholder')}
                icon="git-network-outline"
                disabled
                hint={t('settings.orgAdminOnlyHint')}
              />
            )}

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
                keyboardDismissMode="on-drag"
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
                          // Nested units are indented from the start side: the right in Arabic.
                          { [isRTL ? 'paddingRight' : 'paddingLeft']: spacing.sm + row.depth * spacing.md },
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

      {/* تغيير كلمة المرور */}
      <ChangePasswordModal
        visible={passwordModalVisible}
        onClose={() => setPasswordModalVisible(false)}
        onChanged={() => showStatus('success', t('settings.passwordChanged'))}
      />
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
    // Blends into the page: a modern large-title header without a divider.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconToggle: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  iconTogglePressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  langToggleText: {
    ...typography.bodyBold,
    color: colors.primaryLight,
    textAlign: 'center',
  },
  body: {
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileNameText: {
    ...typography.h4,
    color: colors.text,
  },
  profileUsernameText: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 1,
  },
  profileUnitText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefSelect: {
    marginBottom: 0,
  },
  prefCard: {
    paddingVertical: spacing.xs,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  prefIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefText: {
    flex: 1,
    minWidth: 0,
  },
  prefLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  prefValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  listRowPressed: {
    opacity: 0.7,
  },
  listRowLabel: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
  },
  listRowLabelDanger: {
    color: colors.danger,
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 42,
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
  profileAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
    // `right` (not `end`) so the RTL flip moves the badge to the left in Arabic.
    right: 2,
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
