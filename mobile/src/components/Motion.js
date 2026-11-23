import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { ANIMATIONS_ENABLED, motion } from '../constants/motion';

/*
 * Small animation building blocks on React Native's built-in Animated API
 * (native driver, works in Expo Go and in every build). Everything checks the
 * single ANIMATIONS_ENABLED switch and the phone's Reduce Motion setting.
 */

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((value) => {
    reduceMotion = Boolean(value);
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
  reduceMotion = Boolean(value);
});

export const animationsOn = () => ANIMATIONS_ENABLED && !reduceMotion;

const easeOut = Easing.out(Easing.cubic);

/**
 * Fades its children in and slides them a little when it mounts.
 * `from`: 'bottom' (default), 'top' or 'none'.
 */
export const FadeInView = ({
  children,
  delay = 0,
  duration = motion.enterDuration,
  distance = motion.enterDistance,
  from = 'bottom',
  style,
  ...rest
}) => {
  const [enabled] = useState(animationsOn);
  const progress = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: easeOut,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, progress, duration, delay]);

  if (!enabled) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  const offset = from === 'top' ? -distance : from === 'none' ? 0 : distance;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Pops its children in (slight zoom + fade) when it mounts: windows, icons.
 * `fade={false}` zooms without fading (e.g. a highlight behind an icon).
 */
export const ScaleInView = ({
  children,
  delay = 0,
  duration = motion.fastDuration + 40,
  from = 0.94,
  fade = true,
  style,
  ...rest
}) => {
  const [enabled] = useState(animationsOn);
  const progress = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: easeOut,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, progress, duration, delay]);

  if (!enabled) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        style,
        {
          ...(fade ? { opacity: progress } : null),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }],
        },
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Soft rings that grow out of a round element, like a phone that is ringing.
 * Place it around the element: <PulseRing size={...} active> <Avatar/> </PulseRing>
 */
export const PulseRing = ({ children, size, color = 'rgba(255, 255, 255, 0.35)', active = true, style }) => {
  const [enabled] = useState(animationsOn);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || !active) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, active, pulse]);

  const ring = (phase) => {
    const value = Animated.modulo(Animated.add(pulse, phase), 1);
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        }}
      />
    );
  };

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {enabled && active ? (
        <>
          {ring(0)}
          {ring(0.5)}
        </>
      ) : null}
      {children}
    </View>
  );
};

// The tab that was on screen before the current one (tab indexes grow left to
// right on screen in both languages; see AppNavigator).
let lastTabIndex = null;

/**
 * Tab switch: the new screen slides in from the side of the tab that was
 * tapped (from the right when moving right, from the left when moving left)
 * while fading in. Returns an animated style for an Animated.View.
 *
 * Values are reset while the screen is hidden; at focus the screen is still
 * fully transparent, so setting the slide direction then cannot flash.
 */
export function useTabEntrance(isFocused, tabIndex, { distance = 40, duration = 240 } = {}) {
  const [enabled] = useState(animationsOn);
  const progress = useRef(new Animated.Value(enabled && isFocused ? 0 : 1)).current;
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    if (!isFocused) {
      progress.setValue(0);
      return undefined;
    }
    const previous = lastTabIndex;
    lastTabIndex = tabIndex;
    const direction =
      previous == null || tabIndex < 0 || previous === tabIndex ? 0 : tabIndex > previous ? 1 : -1;
    offset.setValue(direction * distance);
    const animation = Animated.parallel([
      Animated.timing(progress, { toValue: 1, duration, easing: easeOut, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 0, duration, easing: easeOut, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [enabled, isFocused, tabIndex, progress, offset, distance, duration]);

  if (!enabled) return null;
  return { opacity: progress, transform: [{ translateX: offset }] };
}

/**
 * Re-plays a short entrance every time `trigger` becomes true (e.g. when a
 * tab gains focus). Returns an animated style for an Animated.View.
 *
 * The value is reset while the screen is hidden (trigger false), never when it
 * is shown: resetting on show would flash the finished screen for a frame and
 * then jump back, which looks like a jitter. `distance` 0 = a pure fade.
 */
export function useEntrance(trigger, { distance = 0, duration = motion.fastDuration, from = 0.5 } = {}) {
  const [enabled] = useState(animationsOn);
  const progress = useRef(new Animated.Value(enabled && trigger ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    if (!trigger) {
      progress.setValue(0); // hidden: get ready for the next time it shows
      return undefined;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: easeOut,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, trigger, progress, duration]);

  if (!enabled) return null;
  const style = { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) };
  if (distance) {
    style.transform = [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
    ];
  }
  return style;
}
