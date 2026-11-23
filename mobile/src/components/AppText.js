import React, { createContext, forwardRef, useContext } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
} from 'react-native';
import { fonts, fontFor } from '../constants/typography';

/**
 * Drop-in replacements for React Native's Text and TextInput that use the app
 * font everywhere.
 *
 * - React 19 ignores `Text.defaultProps`, so the font is applied here instead.
 * - Custom fonts ignore `fontWeight` on Android, so a style that asks for a
 *   weight gets the matching font file (Regular / Medium / SemiBold / Bold).
 * - Nested Text inherits its parent's font, as in plain React Native.
 */
const APP_FONTS = new Set(Object.values(fonts));
const BASE = { fontFamily: fonts.regular };
const InsideText = createContext(false);

function fontOverride(style) {
  const flat = StyleSheet.flatten(style);
  if (!flat || flat.fontWeight == null) return null;
  // Leave explicit non-app families alone (e.g. monospace for codes).
  if (flat.fontFamily && !APP_FONTS.has(flat.fontFamily)) return null;
  return { fontFamily: fontFor(flat.fontWeight), fontWeight: 'normal' };
}

export const Text = forwardRef(function AppText({ style, children, ...props }, ref) {
  const nested = useContext(InsideText);
  const override = fontOverride(style);
  return (
    <RNText ref={ref} style={[nested ? null : BASE, style, override]} {...props}>
      {nested ? children : <InsideText.Provider value>{children}</InsideText.Provider>}
    </RNText>
  );
});

export const TextInput = forwardRef(function AppTextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} style={[BASE, style, fontOverride(style)]} {...props} />;
});

// Static helpers some code reads from TextInput (e.g. TextInput.State).
Object.assign(TextInput, { State: RNTextInput.State });

export default Text;
