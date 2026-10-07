import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../constants/colors';
import { spacing } from '../constants/spacing';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Main Screens
import DirectoryScreen from '../screens/main/DirectoryScreen';
import CallsScreen from '../screens/main/CallsScreen';
import CallActiveScreen from '../screens/main/CallActiveScreen';
import OrgScreen from '../screens/main/OrgScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// شاشات المصادقة
const AuthStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'slide_from_left',
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// التبويبات الرئيسية
const MainTabs = () => {
  const { t } = useLanguage();
  return (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primaryLight,
      tabBarInactiveTintColor: colors.textLight,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        height: 60,
        paddingBottom: spacing.sm,
        paddingTop: spacing.sm,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
      },
    }}
  >
    <Tab.Screen
      name="Directory"
      component={DirectoryScreen}
      options={{
        tabBarLabel: t('tabs.directory'),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="people" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Calls"
      component={CallsScreen}
      options={{
        tabBarLabel: t('tabs.calls'),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="call" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Org"
      component={OrgScreen}
      options={{
        tabBarLabel: t('tabs.org'),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="business" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Notifications"
      component={NotificationsScreen}
      options={{
        tabBarLabel: t('tabs.notifications'),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="notifications" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{
        tabBarLabel: t('tabs.settings'),
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="settings" size={size} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
  );
};

// الشاشات الرئيسية
const MainStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'slide_from_left',
    }}
  >
    <Stack.Screen name="MainTabs" component={MainTabs} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen 
      name="CallActive" 
      component={CallActiveScreen}
      options={{
        presentation: 'fullScreenModal',
        animation: 'slide_from_bottom',
      }}
    />
  </Stack.Navigator>
);

// الملاحي الرئيسي
const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null; // أو يمكن عرض شاشة تحميل
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;
