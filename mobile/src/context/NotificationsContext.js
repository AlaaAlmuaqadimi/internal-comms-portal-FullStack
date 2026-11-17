import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { api, isBackendConfigured } from '../services/api';
import { loadNotificationSound, playNotificationSound } from '../services/sound';

// Single source of truth for the inbox: the tab badge, the notification list,
// the audible alert and read receipts all read from here.
const NotificationsContext = createContext(null);

const POLL_INTERVAL_MS = 60 * 1000;

// Messenger/WhatsApp-style alerts: a notification rings once and is never
// announced again, even after a logout or an app restart. The ids are kept per
// account so switching users does not suppress the new user's alerts.
const ALERTED_KEY_PREFIX = 'notifications.alerted.v1.';
const MAX_ALERTED_IDS = 500;
const SOUND_SPACING_MS = 900;

const alertedStorageKey = (userId) => `${ALERTED_KEY_PREFIX}${userId}`;

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

export const NotificationsProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const alertedIdsRef = useRef(new Set());
  const alertedReadyRef = useRef(false);
  const soundTimersRef = useRef([]);

  const clearSoundTimers = useCallback(() => {
    for (const timer of soundTimersRef.current) clearTimeout(timer);
    soundTimersRef.current = [];
  }, []);

  const playAlert = useCallback(async () => {
    try {
      const sound = await loadNotificationSound();
      await playNotificationSound(sound);
    } catch {
      // A missing audio module must never break the inbox.
    }
  }, []);

  const persistAlertedIds = useCallback((userId) => {
    if (!userId) return;
    const ids = [...alertedIdsRef.current].slice(-MAX_ALERTED_IDS);
    AsyncStorage.setItem(alertedStorageKey(userId), JSON.stringify(ids)).catch(
      () => {}
    );
  }, []);

  const loadAlertedIds = useCallback(async (userId) => {
    alertedIdsRef.current = new Set();
    alertedReadyRef.current = false;
    if (!userId) return;

    try {
      const raw = await AsyncStorage.getItem(alertedStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          alertedIdsRef.current = new Set(parsed.filter(Boolean));
        }
      }
    } catch {
      alertedIdsRef.current = new Set();
    }
    alertedReadyRef.current = true;
  }, []);

  // Returns the unread notifications that have never been announced on this
  // account and records them before the sound is played.
  const collectNewUnread = useCallback(
    (list) => {
      if (!alertedReadyRef.current) return [];

      const newOnes = (list || []).filter(
        (item) => item.unread && !alertedIdsRef.current.has(item.id)
      );
      if (!newOnes.length) return [];

      for (const item of newOnes) {
        alertedIdsRef.current.add(item.id);
      }
      persistAlertedIds(user?.id);
      return newOnes;
    },
    [persistAlertedIds, user?.id]
  );

  const announce = useCallback(
    (newOnes, perNotification) => {
      if (!newOnes.length) return;

      if (!perNotification) {
        // Login/session restore: one heads-up sound for the batch.
        playAlert();
        return;
      }

      // A live batch: one ring per new notification, spaced so the sounds do
      // not cut each other off. Every notification rings exactly once.
      newOnes.forEach((_, index) => {
        if (index === 0) {
          playAlert();
        } else {
          const timer = setTimeout(() => playAlert(), index * SOUND_SPACING_MS);
          soundTimersRef.current.push(timer);
        }
      });
    },
    [playAlert]
  );

  const fetchList = useCallback(async () => {
    if (!isAuthenticated || !isBackendConfigured()) return null;

    const result = await api.notifications.getAll();
    const list = Array.isArray(result?.notifications) ? result.notifications : [];
    const count =
      typeof result?.unreadCount === 'number'
        ? result.unreadCount
        : list.filter((item) => item.unread).length;

    setNotifications(list);
    setUnreadCount(count);
    setError(null);
    return { notifications: list, unreadCount: count };
  }, [isAuthenticated]);

  // Initial load for every login/session restore. New-to-this-device unread
  // notifications ring once; notifications already announced stay silent.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      alertedIdsRef.current = new Set();
      alertedReadyRef.current = false;
      clearSoundTimers();
      return undefined;
    }

    let cancelled = false;

    (async () => {
      if (!isBackendConfigured()) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await loadAlertedIds(user.id);
        if (cancelled) return;

        const result = await fetchList();
        if (cancelled || !result) return;

        announce(collectNewUnread(result.notifications), false);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearSoundTimers();
    };
  }, [isAuthenticated, user?.id, fetchList, loadAlertedIds, collectNewUnread, announce, clearSoundTimers]);

  // Polling keeps the badge honest while the app is open, and rings once for
  // each newly arrived notification. Pauses automatically in the background.
  useEffect(() => {
    if (!isAuthenticated || !isBackendConfigured()) return undefined;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || AppState.currentState !== 'active') return;
      try {
        const result = await fetchList();
        if (cancelled || !result) return;

        announce(collectNewUnread(result.notifications), true);
      } catch {
        // Keep the last known list; the next tick retries.
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription?.remove?.();
    };
  }, [isAuthenticated, fetchList, collectNewUnread, announce]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isBackendConfigured()) return;

    setLoading(true);
    try {
      const result = await fetchList();
      if (result) {
        announce(collectNewUnread(result.notifications), false);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fetchList, isAuthenticated, collectNewUnread, announce]);

  const markRead = useCallback(
    async (id) => {
      if (!id) return;

      const target = notifications.find((item) => item.id === id);
      if (target?.unread) {
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, unread: false } : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      // Opening a notification counts as having seen it, so it must not ring
      // later if it is still unread on the server for another reason.
      alertedIdsRef.current.add(id);
      persistAlertedIds(user?.id);

      if (!isBackendConfigured()) return;
      try {
        await api.notifications.markAsRead(id);
      } catch {
        // Re-sync so a failed acknowledgement does not leave a phantom badge.
        refresh().catch(() => {});
      }
    },
    [notifications, refresh, persistAlertedIds, user?.id]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((item) => (item.unread ? { ...item, unread: false } : item))
    );
    setUnreadCount(0);
    for (const item of notifications) {
      alertedIdsRef.current.add(item.id);
    }
    persistAlertedIds(user?.id);

    if (!isBackendConfigured()) return;
    try {
      await api.notifications.markAllAsRead();
    } catch {
      refresh().catch(() => {});
    }
  }, [notifications, refresh, persistAlertedIds, user?.id]);

  const publish = useCallback(
    async (payload) => {
      const created = await api.notifications.create(payload);

      try {
        const result = await fetchList();
        if (result) {
          announce(collectNewUnread(result.notifications), true);
        }
      } catch {
        // Publishing succeeded; the list will refresh on the next poll.
      }

      return created;
    },
    [fetchList, collectNewUnread, announce]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      publish,
    }),
    [
      notifications,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      publish,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export default NotificationsContext;
