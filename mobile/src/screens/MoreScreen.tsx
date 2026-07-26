import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Card, Text } from '@sohantalukder/rn-kit';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Screen } from '@/components/Screen';
import { useApp } from '@/app/AppProvider';
import { useReactiveQuery } from '@/database/useReactiveQuery';
import type { RootStackParamList } from '@/navigation/types';

type Preference = { religion: string };

export function MoreScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { pendingCount, logout } = useApp();
  const parameters = useMemo(() => [], []);
  const tables = useMemo(() => ['preferences'], []);
  const { data } = useReactiveQuery<Preference>(
    'select religion from preferences limit 1',
    parameters,
    tables
  );
  const links: {
    title: string;
    copy: string;
    route: keyof RootStackParamList;
  }[] = [
    {
      title: 'Profile',
      copy: 'Name, photo, units, and timezone',
      route: 'Profile',
    },
    {
      title: 'Settings',
      copy: 'Goals, reminders, digest, prayer, and location',
      route: 'Settings',
    },
    {
      title: 'Security',
      copy: 'Email, password, sessions, and account deletion',
      route: 'Security',
    },
  ];
  if (data[0]?.religion === 'muslim') {
    links.unshift({
      title: 'Prayers',
      copy: 'Local prayer times and tracking',
      route: 'Prayers',
    });
  }

  function askToLogout() {
    if (!pendingCount) {
      Alert.alert('Sign out?', 'Your encrypted local data will be removed.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => void logout(false),
        },
      ]);
      return;
    }
    Alert.alert(
      'Pending changes',
      `${pendingCount} change${pendingCount === 1 ? '' : 's'} have not synced.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect & sync first',
          onPress: () => void logout(false),
        },
        {
          text: 'Discard & sign out',
          style: 'destructive',
          onPress: () => void logout(true),
        },
      ]
    );
  }

  return (
    <Screen
      title="More"
      subtitle="Your account and personal settings."
    >
      {links.map((link) => (
        <Card
          key={link.title}
          variant="outlined"
          pressable
          onPress={() => navigation.navigate(link.route as 'Profile')}
        >
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text
                variant="heading3"
                weight="semibold"
              >
                {link.title}
              </Text>
              <Text color="secondary">{link.copy}</Text>
            </View>
            <Text color="primary">›</Text>
          </View>
        </Card>
      ))}
      <Card
        variant="outlined"
        pressable
        borderColor="#E8B4B4"
        onPress={askToLogout}
      >
        <Text
          color="error"
          weight="semibold"
        >
          Sign out
        </Text>
        <Text color="secondary">
          Pending changes must be synced or explicitly discarded.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 3 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
});
