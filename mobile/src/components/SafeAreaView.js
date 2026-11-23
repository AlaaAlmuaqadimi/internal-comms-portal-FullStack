import React from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigationState, useRoute } from '@react-navigation/native';
import { useTabEntrance } from './Motion';

// No bottom edge by default: the tab screens sit above the tab bar, which
// already leaves room for the home indicator. Screens without a tab bar (Add
// User) ask for the bottom edge explicitly.
const DEFAULT_EDGES = ['top', 'right', 'left'];
const PADDING = {
  top: 'paddingTop',
  right: 'paddingRight',
  bottom: 'paddingBottom',
  left: 'paddingLeft',
};

/** Tab switch animation: the screen slides in from the side of the new tab. */
const TabEntrance = ({ children }) => {
  const isFocused = useIsFocused();
  const route = useRoute();
  const tabIndex = useNavigationState(
    (state) => state?.routes?.findIndex((item) => item.key === route.key) ?? -1
  );
  const entrance = useTabEntrance(isFocused, tabIndex);
  return <Animated.View style={[styles.fill, entrance]}>{children}</Animated.View>;
};

/**
 * Safe-area container for the app's screens.
 *
 * Same props as react-native-safe-area-context's SafeAreaView (`edges`,
 * `style`), but the insets come from the safe-area context instead of the
 * native view. That lets the minimized call bar (CallBanner) tell the screens
 * below it that the status bar is already covered, so they do not leave an
 * empty gap under the bar. Insets are added to the style's own padding.
 *
 * `animated`: for tab screens; the content slides in on every tab switch.
 */
const SafeAreaView = ({ edges = DEFAULT_EDGES, style, children, animated = false, ...rest }) => {
  const insets = useSafeAreaInsets();
  const list = Array.isArray(edges) ? edges : Object.keys(edges || {});
  const flat = StyleSheet.flatten(style) || {};

  const padding = {};
  for (const edge of list) {
    const key = PADDING[edge];
    if (!key) continue;
    const own =
      flat[key] ??
      (edge === 'top' || edge === 'bottom' ? flat.paddingVertical : flat.paddingHorizontal) ??
      flat.padding ??
      0;
    padding[key] = (Number(own) || 0) + (insets[edge] || 0);
  }

  return (
    <View style={[style, padding, animated && styles.clip]} {...rest}>
      {animated ? <TabEntrance>{children}</TabEntrance> : children}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // The sliding content must not peek outside the screen.
  clip: {
    overflow: 'hidden',
  },
});

export { SafeAreaView };
export default SafeAreaView;
