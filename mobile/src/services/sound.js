import AsyncStorage from '@react-native-async-storage/async-storage';

// Notification tones are stored on the device. They are a personal preference
// and do not need to round-trip through the API, so they keep working even when
// the backend is offline. The keys are stable; the labels are translated in the
// Settings screen.
const STORAGE_KEY = 'preferences.notificationSound';

export const DEFAULT_NOTIFICATION_SOUND = 'ding';

export const NOTIFICATION_SOUNDS = [
  {
    key: 'ding',
    icon: 'notifications',
    labelKey: 'settings.soundDing',
    descriptionKey: 'settings.soundDingHint',
  },
  {
    key: 'chime',
    icon: 'trending-up',
    labelKey: 'settings.soundChime',
    descriptionKey: 'settings.soundChimeHint',
  },
  {
    key: 'bell',
    icon: 'notifications-circle',
    labelKey: 'settings.soundBell',
    descriptionKey: 'settings.soundBellHint',
  },
  {
    key: 'soft',
    icon: 'leaf',
    labelKey: 'settings.soundSoft',
    descriptionKey: 'settings.soundSoftHint',
  },
  {
    key: 'silent',
    icon: 'volume-mute',
    labelKey: 'settings.soundSilent',
    descriptionKey: 'settings.soundSilentHint',
  },
];

const SOURCES = {
  tick: require('../../assets/sounds/tick.wav'),
  ding: require('../../assets/sounds/ding.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  bell: require('../../assets/sounds/bell.wav'),
  soft: require('../../assets/sounds/soft.wav'),
};

// expo-audio ships a native module. Importing it lazily keeps the rest of the
// app usable on builds that have not been regenerated yet (for example an old
// dev client): sound simply stays disabled instead of crashing the screen.
let audioModule;
let audioLoadAttempted = false;
const players = {};

function getAudio() {
  if (audioLoadAttempted) return audioModule;
  audioLoadAttempted = true;

  try {
    // eslint-disable-next-line global-require
    audioModule = require('expo-audio');

    if (audioModule?.setAudioModeAsync) {
      audioModule
        .setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
        })
        .catch(() => {});
    }
  } catch {
    audioModule = null;
  }

  return audioModule;
}

function getPlayer(key) {
  if (!SOURCES[key]) return null;

  const audio = getAudio();
  if (!audio?.createAudioPlayer) return null;

  if (!players[key]) {
    try {
      const player = audio.createAudioPlayer(SOURCES[key]);
      player.volume = key === 'tick' ? 0.55 : 0.9;
      players[key] = player;
    } catch {
      return null;
    }
  }

  return players[key];
}

export async function playSound(key) {
  if (!key || key === 'silent') return;

  const player = getPlayer(key);
  if (!player) return;

  try {
    await player.seekTo(0);
  } catch {
    // A brand-new player may not be ready to seek yet; play from its start.
  }

  try {
    player.play();
  } catch {
    // Playback is feedback only; never let a missing codec break the UI.
  }
}

export function playNotificationSound(key) {
  return playSound(key);
}

// Wheel scraping fires dozens of events per second. Throttle the tick so it
// sounds like a mechanical spinner instead of a buzz.
let lastTickAt = 0;
export function playTick() {
  const now = Date.now();
  if (now - lastTickAt < 45) return;
  lastTickAt = now;
  playSound('tick');
}

export async function loadNotificationSound() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (NOTIFICATION_SOUNDS.some((option) => option.key === stored)) {
      return stored;
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_NOTIFICATION_SOUND;
}

export async function saveNotificationSound(key) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, key);
  } catch {
    // A failed preference write must not block the settings screen.
  }
}
