import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  MultilineInput,
  Skeleton,
  Text,
} from '@sohantalukder/rn-kit';
import { Screen } from '@/components/Screen';
import type { Habit } from '@/core/models';
import { saveJournal, toggleHabit } from '@/database/repository';
import { useReactiveQuery } from '@/database/useReactiveQuery';

const checkBorder = '#9CA89F';
const checkedColor = '#52765C';
const progressColor = '#D8E9D5';
const trackColor = 'rgba(255,255,255,0.25)';

type TodayHabit = Habit & {
  log_id: string | null;
  log_status: string | null;
  log_error: string | null;
};
type Journal = {
  win_note: string | null;
  reflection_note: string | null;
};

export function TodayScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const parameters = useMemo(() => [today], [today]);
  const tables = useMemo(() => ['habits', 'habit_logs'], []);
  const journalTables = useMemo(() => ['journals'], []);
  const { data: habits, loading } = useReactiveQuery<TodayHabit>(
    `select h.*,l.id as log_id,l.status as log_status,
     coalesce(l.sync_error,h.sync_error) as log_error
     from habits h left join habit_logs l
       on l.habit_id=h.id and l.local_date=? and l.deleted_at is null
     where h.deleted_at is null and h.state='active'
     order by h.rowid`,
    parameters,
    tables
  );
  const { data: journals } = useReactiveQuery<Journal>(
    'select win_note,reflection_note from journals where local_date=?',
    parameters,
    journalTables
  );
  const [win, setWin] = useState('');
  const [reflection, setReflection] = useState('');
  const completed = habits.filter(
    (habit) => habit.log_status === 'done'
  ).length;
  const progress = habits.length
    ? Math.round((completed / habits.length) * 100)
    : 0;
  const journal = journals[0];

  return (
    <Screen
      title="Today"
      subtitle={new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}
    >
      <Card
        backgroundColor="#183B2B"
        padding={20}
      >
        <View style={styles.hero}>
          <Text
            color="white"
            variant="heading2"
            weight="bold"
          >
            {progress}% complete
          </Text>
          <Text color="white">
            {completed} of {habits.length} promises kept
          </Text>
          <View style={styles.track}>
            <View style={[styles.progress, { width: `${progress}%` }]} />
          </View>
        </View>
      </Card>
      <View style={styles.sectionTitle}>
        <Text
          variant="heading3"
          weight="semibold"
        >
          Your practice
        </Text>
        <Text color="secondary">Tap to check in or undo</Text>
      </View>
      {loading ? (
        <>
          <Skeleton
            height={82}
            borderRadius={16}
          />
          <Skeleton
            height={82}
            borderRadius={16}
          />
        </>
      ) : (
        habits.map((habit) => (
          <Card
            key={habit.id}
            variant="outlined"
            pressable
            onPress={() => void toggleHabit(habit.id, today)}
            {...(habit.log_status === 'done' ? { borderColor: '#6A8D73' } : {})}
          >
            <View style={styles.habit}>
              <Text style={styles.emoji}>{habit.icon}</Text>
              <View style={styles.flex}>
                <Text
                  variant="body1"
                  weight="semibold"
                >
                  {habit.name}
                </Text>
                <Text
                  variant="body3"
                  color="secondary"
                >
                  {habit.target
                    ? `${habit.target} ${habit.unit ?? ''}`.trim()
                    : habit.category}
                </Text>
                {habit.log_error && (
                  <Text
                    variant="body3"
                    color="error"
                  >
                    {habit.log_error}
                  </Text>
                )}
              </View>
              <View
                accessibilityLabel={
                  habit.log_status === 'done' ? 'Completed' : 'Not completed'
                }
                style={[
                  styles.check,
                  habit.log_status === 'done' && styles.checked,
                ]}
              >
                <Text
                  color={habit.log_status === 'done' ? 'white' : 'secondary'}
                >
                  {habit.log_status === 'done' ? '✓' : ''}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
      {!loading && !habits.length && (
        <Card variant="outlined">
          <Text weight="semibold">A quiet page for a fresh start.</Text>
          <Text color="secondary">Add a habit from the Habits tab.</Text>
        </Card>
      )}
      <Card variant="outlined">
        <View style={styles.journal}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Daily journal
          </Text>
          <MultilineInput
            label="Today’s win"
            value={win || journal?.win_note || ''}
            onChangeText={setWin}
            numberOfLines={3}
          />
          <MultilineInput
            label="Reflection"
            value={reflection || journal?.reflection_note || ''}
            onChangeText={setReflection}
            numberOfLines={4}
          />
          <Button
            text="Save journal"
            onPress={() =>
              void saveJournal(
                today,
                win || journal?.win_note || '',
                reflection || journal?.reflection_note || ''
              )
            }
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: {
    alignItems: 'center',
    borderColor: checkBorder,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  checked: { backgroundColor: checkedColor, borderColor: checkedColor },
  emoji: { fontSize: 28 },
  flex: { flex: 1, gap: 3 },
  habit: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  hero: { gap: 8 },
  journal: { gap: 14 },
  progress: { backgroundColor: progressColor, borderRadius: 4, height: 8 },
  sectionTitle: { gap: 2, marginTop: 4 },
  track: {
    backgroundColor: trackColor,
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
});
