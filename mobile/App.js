import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { CallProvider } from './src/context/CallContext';
import CallOverlay from './src/components/calls/CallOverlay';
import CallBanner, { CallBannerInsets } from './src/components/calls/CallBanner';
import AppNavigator from './src/navigation/AppNavigator';
import {
  useFonts,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { View, ActivityIndicator } from 'react-native';
import { colors } from './src/constants/colors';

// Light screens get dark status-bar icons, dark mode gets light ones.
const ThemedStatusBar = () => {
  const { colors, isDarkMode } = useTheme();
  return (
    <StatusBar
      style={isDarkMode ? 'light' : 'dark'}
      backgroundColor={colors.surface}
    />
  );
};

// The app font is applied by src/components/AppText (React 19 ignores
// Text.defaultProps), so loading the files is all that is needed here.
export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <NotificationsProvider>
              <CallProvider>
                <ThemedStatusBar />
                {/* A minimized call shows as a bar above the screens and
                    pushes them down, like WhatsApp. */}
                <View style={{ flex: 1 }}>
                  <CallBanner />
                  <CallBannerInsets>
                    <View style={{ flex: 1 }}>
                      <AppNavigator />
                    </View>
                  </CallBannerInsets>
                </View>
                <CallOverlay />
              </CallProvider>
            </NotificationsProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
