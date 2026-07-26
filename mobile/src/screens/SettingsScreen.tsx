import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { Button, Card, Text, TextInput } from '@sohantalukder/rn-kit';
import { Screen } from '@/components/Screen';
import { useApp } from '@/app/AppProvider';
import {
  saveHabitReminder,
  saveProfile,
  savePreferences,
} from '@/database/repository';
import { setPushEnabled as persistPushEnabled } from '@/push/pushService';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type Preference = {
  goals: string;
  pace: 'light' | 'balanced' | 'ambitious';
  daily_digest_time: string;
  daily_digest_enabled: number;
  push_enabled: number;
  religion: 'muslim' | 'other' | 'unspecified';
  latitude: number | null;
  longitude: number | null;
  madhab: 'hanafi' | 'shafi' | 'maliki' | 'hanbali' | null;
  calculation_method: string | null;
};
type HabitReminder = {
  id: string;
  name: string;
  reminder_enabled: number;
  reminder_time: string | null;
};
type Profile = {
  email: string;
  name: string;
  timezone: string;
  units: 'metric' | 'imperial';
};

const allGoals = ['movement', 'nutrition', 'learning', 'sleep', 'mindfulness'];
const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const chipBorder = '#D7DDD8';
const chipSelectedBackground = '#EDF7EF';
const chipSelectedBorder = '#6A8D73';

export function SettingsScreen() {
  const { session } = useApp();
  const empty = useMemo(() => [], []);
  const preferenceTables = useMemo(() => ['preferences'], []);
  const reminderTables = useMemo(() => ['habits', 'habit_reminders'], []);
  const profileTables = useMemo(() => ['profile'], []);
  const { data: preferences } = useReactiveQuery<Preference>(
    'select * from preferences limit 1',
    empty,
    preferenceTables
  );
  const { data: habits } = useReactiveQuery<HabitReminder>(
    `select h.id,h.name,coalesce(r.enabled,0) reminder_enabled,
     r.time_local reminder_time from habits h
     left join habit_reminders r on r.habit_id=h.id
     where h.deleted_at is null order by h.rowid`,
    empty,
    reminderTables
  );
  const { data: profiles } = useReactiveQuery<Profile>(
    'select email,name,timezone,units from profile limit 1',
    empty,
    profileTables
  );
  const stored = preferences[0];
  const profile = profiles[0];
  const [goals, setGoals] = useState<string[]>([]);
  const [pace, setPace] = useState<Preference['pace'] | ''>('');
  const [units, setUnits] = useState<'metric' | 'imperial' | null>(null);
  const [religion, setReligion] = useState<Preference['religion'] | ''>('');
  const [digestTime, setDigestTime] = useState('');
  const [digestEnabled, setDigestEnabled] = useState<boolean | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const resolvedGoals = goals.length
    ? goals
    : stored
      ? (JSON.parse(stored.goals) as string[])
      : ['movement'];
  const resolvedReligion = religion || stored?.religion || 'unspecified';
  const resolvedPace = pace || stored?.pace || 'balanced';
  const resolvedUnits = units ?? profile?.units ?? 'metric';

  function locate() {
    Geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      (error) => Alert.alert('Location unavailable', error.message),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  async function save() {
    if (!session) return;
    const lat = latitude ?? stored?.latitude ?? 23.8103;
    const lng = longitude ?? stored?.longitude ?? 90.4125;
    const resolvedPushEnabled =
      pushEnabled ?? Boolean(stored?.push_enabled ?? true);
    await savePreferences(session.user.id, {
      goals: resolvedGoals,
      pace: resolvedPace,
      religion: resolvedReligion,
      dailyDigestTime: (
        digestTime ||
        stored?.daily_digest_time ||
        '20:00'
      ).slice(0, 5),
      dailyDigestEnabled:
        digestEnabled ?? Boolean(stored?.daily_digest_enabled ?? true),
      pushEnabled: resolvedPushEnabled,
      prayerSetup:
        resolvedReligion === 'muslim'
          ? {
              latitude: lat,
              longitude: lng,
              timezone: 'Asia/Dhaka',
              madhab: stored?.madhab ?? 'hanafi',
              calculationMethod: stored?.calculation_method ?? 'karachi',
              reminders: prayers.map((prayer) => ({
                prayer,
                enabled: true,
                offsetMinutes: 0,
              })),
            }
          : null,
    });
    await saveProfile({
      id: session.user.id,
      email: profile?.email ?? session.user.email,
      name: profile?.name ?? session.user.name,
      timezone: profile?.timezone ?? 'Asia/Dhaka',
      units: resolvedUnits,
    });
    await persistPushEnabled(resolvedPushEnabled);
    Alert.alert('Saved', 'Settings are available offline and queued for sync.');
  }

  return (
    <Screen
      title="Settings"
      subtitle="Goals, pace, reminders, digest, and prayer preferences."
    >
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Goals & pace
          </Text>
          <View style={styles.wrap}>
            {allGoals.map((goal) => (
              <Chip
                key={goal}
                label={goal}
                selected={resolvedGoals.includes(goal)}
                onPress={() =>
                  setGoals((current) => {
                    const base = current.length ? current : resolvedGoals;
                    return base.includes(goal)
                      ? base.filter((item) => item !== goal)
                      : [...base, goal];
                  })
                }
              />
            ))}
          </View>
          <View style={styles.wrap}>
            {(['light', 'balanced', 'ambitious'] as const).map((value) => (
              <Chip
                key={value}
                label={value}
                selected={resolvedPace === value}
                onPress={() => setPace(value)}
              />
            ))}
          </View>
          <Text weight="medium">Measurement units</Text>
          <View style={styles.wrap}>
            {(['metric', 'imperial'] as const).map((value) => (
              <Chip
                key={value}
                label={value}
                selected={resolvedUnits === value}
                onPress={() => setUnits(value)}
              />
            ))}
          </View>
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Daily digest & push
          </Text>
          <TextInput
            label="Digest time (HH:mm)"
            value={
              digestTime || stored?.daily_digest_time?.slice(0, 5) || '20:00'
            }
            onChangeText={setDigestTime}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.wrap}>
            <Chip
              label="Daily digest"
              selected={digestEnabled ?? Boolean(stored?.daily_digest_enabled)}
              onPress={() =>
                setDigestEnabled(
                  !(digestEnabled ?? Boolean(stored?.daily_digest_enabled))
                )
              }
            />
            <Chip
              label="Push notifications"
              selected={pushEnabled ?? Boolean(stored?.push_enabled)}
              onPress={() =>
                setPushEnabled(!(pushEnabled ?? Boolean(stored?.push_enabled)))
              }
            />
          </View>
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Religion & prayer calculation
          </Text>
          <View style={styles.wrap}>
            {(['unspecified', 'muslim', 'other'] as const).map((value) => (
              <Chip
                key={value}
                label={value}
                selected={resolvedReligion === value}
                onPress={() => setReligion(value)}
              />
            ))}
          </View>
          {resolvedReligion === 'muslim' && (
            <>
              <Text color="secondary">
                Location:{' '}
                {(latitude ?? stored?.latitude)?.toFixed(4) ?? 'not set'},{' '}
                {(longitude ?? stored?.longitude)?.toFixed(4) ?? 'not set'}
              </Text>
              <Button
                text="Use current location"
                variant="outline"
                onPress={locate}
              />
              <Text color="secondary">
                Madhab: {stored?.madhab ?? 'hanafi'} · Method:{' '}
                {(stored?.calculation_method ?? 'karachi').replace(/_/g, ' ')}
              </Text>
            </>
          )}
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Habit reminders
          </Text>
          {habits.map((habit) => (
            <View
              key={habit.id}
              style={styles.reminder}
            >
              <View style={styles.flex}>
                <Text weight="medium">{habit.name}</Text>
                <Text
                  variant="body3"
                  color="secondary"
                >
                  {habit.reminder_enabled
                    ? habit.reminder_time?.slice(0, 5)
                    : 'Off'}
                </Text>
              </View>
              <Button
                text={habit.reminder_enabled ? 'Turn off' : '8:00 AM'}
                variant="outline"
                onPress={() =>
                  void saveHabitReminder(
                    habit.id,
                    !habit.reminder_enabled,
                    !habit.reminder_enabled ? '08:00' : null
                  )
                }
              />
            </View>
          ))}
        </View>
      </Card>
      <Button
        text="Save settings"
        disabled={!resolvedGoals.length}
        onPress={() => void save()}
      />
      <Text
        color="secondary"
        variant="body3"
      >
        Background sync is best-effort. Foreground and restored-connectivity
        sync run deterministically; iOS may throttle background fetch.
      </Text>
    </Screen>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text>{label.replace(/_/g, ' ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  chip: {
    borderColor: chipBorder,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipSelected: {
    backgroundColor: chipSelectedBackground,
    borderColor: chipSelectedBorder,
  },
  flex: { flex: 1, gap: 2 },
  reminder: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
