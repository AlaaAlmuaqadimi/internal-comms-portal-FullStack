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
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// التبويبات الرئيسية
const MainTabs = () => {
  const { t, isRTL } = useLanguage();
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
      {orderedTabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
};

// الشاشات الرئيسية
const MainStack = () => {
  const { isRTL } = useLanguage();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: isRTL ? 'slide_from_left' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
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
  ); // تم إضافة قوس الإغلاق الناقص هنا
};

// الملاحي الرئيسي
const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer key={isAuthenticated ? 'authenticated' : 'unauthenticated'}>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;
