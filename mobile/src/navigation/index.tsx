import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, useTheme } from '@sohantalukder/rn-kit';
import { useApp } from '@/app/AppProvider';
import { setPushRouteHandler } from '@/push/pushService';
import { AuthScreen } from '@/screens/AuthScreen';
import { HabitsScreen } from '@/screens/HabitsScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { InboxScreen } from '@/screens/InboxScreen';
import { MoreScreen } from '@/screens/MoreScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { PrayersScreen } from '@/screens/PrayersScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { SecurityScreen } from '@/screens/SecurityScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const tabIcons: Record<keyof MainTabParamList, string> = {
  Today: '◉',
  Habits: '✦',
  History: '▥',
  Inbox: '✉',
  More: '•••',
};
const tabIconStyle = (color: string) => [styles.tabIcon, { color }];

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text,
        tabBarStyle: {
          height: 66,
          paddingTop: 7,
          paddingBottom: 7,
          backgroundColor: colors.background,
        },
        tabBarIcon: ({ color }) => (
          <Text style={tabIconStyle(color)}>{tabIcons[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen
        name="Today"
        component={TodayScreen}
      />
      <Tabs.Screen
        name="Habits"
        component={HabitsScreen}
      />
      <Tabs.Screen
        name="History"
        component={HistoryScreen}
      />
      <Tabs.Screen
        name="Inbox"
        component={InboxScreen}
      />
      <Tabs.Screen
        name="More"
        component={MoreScreen}
      />
    </Tabs.Navigator>
  );
}

export default function Navigation() {
  const { navigationTheme, colors } = useTheme();
  const { ready, reauthRequired, session } = useApp();
  useEffect(() => {
    setPushRouteHandler((destination) => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Main', {
          screen: destination === 'Prayers' ? 'More' : destination,
        });
        if (destination === 'Prayers') navigationRef.navigate('Prayers');
      }
    });
    return () => setPushRouteHandler(null);
  }, []);

  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator
          color={colors.primary}
          size="large"
        />
        <Text color="secondary">Opening your encrypted Bloom…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session || reauthRequired ? (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
          />
        ) : !session.user.onboardingCompleted ? (
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
            />
            <Stack.Screen
              name="Prayers"
              component={PrayersScreen}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
            />
            <Stack.Screen
              name="Security"
              component={SecurityScreen}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  tabIcon: { fontSize: 18 },
});
