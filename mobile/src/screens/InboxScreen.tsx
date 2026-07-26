import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@sohantalukder/rn-kit';
import { Screen } from '@/components/Screen';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type Notification = {
  id: string;
  title: string;
  body: string;
  scheduled_at: string;
  state: string;
};

export function InboxScreen() {
  const parameters = useMemo(() => [], []);
  const tables = useMemo(() => ['notifications'], []);
  const { data } = useReactiveQuery<Notification>(
    'select * from notifications order by scheduled_at desc limit 100',
    parameters,
    tables
  );
  return (
    <Screen
      title="Inbox"
      subtitle="Cached messages remain available offline."
    >
      {data.map((item) => (
        <Card
          key={item.id}
          variant="outlined"
        >
          <View style={styles.item}>
            <Text weight="semibold">{item.title}</Text>
            <Text color="secondary">{item.body}</Text>
            <Text
              variant="body3"
              color="disabled"
            >
              {new Date(item.scheduled_at).toLocaleString()}
            </Text>
          </View>
        </Card>
      ))}
      {!data.length && (
        <Card variant="outlined">
          <Text weight="semibold">You’re all caught up.</Text>
          <Text color="secondary">
            Reminders and announcements will land here.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ item: { gap: 6 } });
