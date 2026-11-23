import React from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationsContext';
import { spacing, borderRadius, shadows } from '../constants/spacing';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';

// Main Screens
import DirectoryScreen from '../screens/main/DirectoryScreen';
import CallsScreen from '../screens/main/CallsScreen';
import OrgScreen from '../screens/main/OrgScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import AddUserScreen from '../screens/main/AddUserScreen';
import { hasRole } from '../utils/permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '../constants/typography';
import { ScaleInView } from '../components/Motion';
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator(); // تم تصحيح استدعاء الدالة هنا

// شاشات المصادقة
const AuthStack = () => {
  const { isRTL } = useLanguage();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: isRTL ? 'slide_from_left' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

// التبويبات الرئيسية
const MainTabs = () => {
  const { t, isRTL } = useLanguage();
  const { colors } = useTheme();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: 'Calls', component: CallsScreen, label: t('tabs.calls'), icon: 'call' },
    { name: 'Directory', component: DirectoryScreen, label: t('tabs.directory'), icon: 'people' },
    { name: 'Org', component: OrgScreen, label: t('tabs.org'), icon: 'business' },
    { name: 'Notifications', component: NotificationsScreen, label: t('tabs.notifications'), icon: 'notifications' },
    { name: 'Settings', component: SettingsScreen, label: t('tabs.settings'), icon: 'settings' },
  ];
  const orderedTabs = isRTL ? [...tabs].reverse() : tabs;
  
  return (
    <Tab.Navigator
      initialRouteName="Calls"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textLight,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 68 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          paddingTop: spacing.sm,
          ...shadows.lg,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.06,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 15,
          fontFamily: fonts.semiBold,
          marginTop: 2,
        },
      }}
    >
      {orderedTabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            // A numeric badge on the notifications tab tells the user how many
            // notifications are still unread.
            ...(tab.name === 'Notifications' && unreadCount > 0
              ? {
                  tabBarBadge: unreadCount > 99 ? '99+' : unreadCount,
                  tabBarBadgeStyle: {
                    backgroundColor: colors.danger,
                    color: colors.textWhite,
                    fontSize: 10,
                    fontFamily: fonts.bold,
                    minWidth: 18,
                    height: 18,
                    lineHeight: 18,
                    borderWidth: 2,
                    borderColor: colors.surface,
                  },
                }
              : {}),
            // Active tab: filled icon on a soft tinted pill; others outlined.
            // The highlight pops in when the tab is selected.
            tabBarIcon: ({ color, focused }) => {
              const pill = {
                width: 56,
                height: 30,
                borderRadius: borderRadius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.primarySoft : 'transparent',
              };
              return focused ? (
                <ScaleInView from={0.55} fade={false} duration={240} style={pill}>
                  <Ionicons name={tab.icon} size={22} color={color} />
                </ScaleInView>
              ) : (
                <View style={pill}>
                  <Ionicons name={`${tab.icon}-outline`} size={22} color={color} />
                </View>
              );
            },
          }}
        />
      ))}
    </Tab.Navigator>
  );
};

// الشاشات الرئيسية
const MainStack = () => {
  const { isRTL } = useLanguage();
  const { user } = useAuth();
  const isAdmin = hasRole(user, 'admin');
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: isRTL ? 'slide_from_left' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
      {/* AddUser is only mounted for the admin role; the server enforces the
          same rule on POST /api/users. */}
      {isAdmin && (
        <Stack.Screen name="AddUser" component={AddUserScreen} />
      )}
      {/* The live call is shown by CallOverlay (App.js), not as a route. */}
    </Stack.Navigator>
  ); // تم إضافة قوس الإغلاق الناقص هنا
};

// الملاحي الرئيسي
const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();
  const { colors, isDarkMode } = useTheme();

  if (loading) {
    return null;
  }

  const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primaryLight,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <NavigationContainer
      theme={navigationTheme}
      key={isAuthenticated ? 'authenticated' : 'unauthenticated'}
    >
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;
