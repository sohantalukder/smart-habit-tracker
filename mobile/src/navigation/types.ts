import type { NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';

export type MainTabParamList = {
  Today: undefined;
  Habits: undefined;
  History: undefined;
  Inbox: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Prayers: undefined;
  Profile: undefined;
  Settings: undefined;
  Security: undefined;
};

export type RootScreenProps<S extends keyof RootStackParamList> =
  StackScreenProps<RootStackParamList, S>;

export type TabScreenProps<S extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, S>;
