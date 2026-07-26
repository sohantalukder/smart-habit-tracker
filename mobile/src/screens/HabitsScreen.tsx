import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from '@sohantalukder/rn-kit';
import { Screen } from '@/components/Screen';
import type { Habit } from '@/core/models';
import { createHabit, deleteHabit } from '@/database/repository';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type Template = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  habit_type: Habit['habit_type'];
  default_target: number | null;
  default_unit: string | null;
  default_frequency: string;
};

export function HabitsScreen() {
  const noParameters = useMemo(() => [], []);
  const habitTables = useMemo(() => ['habits'], []);
  const templateTables = useMemo(() => ['habit_templates'], []);
  const { data: habits } = useReactiveQuery<Habit>(
    'select * from habits where deleted_at is null order by rowid',
    noParameters,
    habitTables
  );
  const { data: templates } = useReactiveQuery<Template>(
    `select * from habit_templates where id not in (
       select template_id from habits where template_id is not null and deleted_at is null
     ) order by recommendation_priority limit 12`,
    noParameters,
    templateTables
  );
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🌱');

  async function addCustom() {
    await createHabit({
      name: name.trim(),
      icon: icon.trim() || '🌱',
      category: 'other',
      type: 'do',
      target: null,
      unit: null,
      frequency: { kind: 'daily' },
      forgiving: false,
    });
    setName('');
    setShowForm(false);
  }

  return (
    <Screen
      title="Habits"
      subtitle="Your routines live on this device first."
      action={
        <Button
          text={showForm ? 'Close' : 'Add'}
          onPress={() => setShowForm((value) => !value)}
        />
      }
    >
      {showForm && (
        <Card variant="outlined">
          <View style={styles.form}>
            <Text
              variant="heading3"
              weight="semibold"
            >
              Custom habit
            </Text>
            <TextInput
              label="Icon"
              value={icon}
              onChangeText={setIcon}
              maxLength={8}
            />
            <TextInput
              label="Habit name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Button
              text="Create habit"
              disabled={!name.trim()}
              onPress={() => void addCustom()}
            />
          </View>
        </Card>
      )}
      <Text
        variant="heading3"
        weight="semibold"
      >
        Active habits
      </Text>
      {habits.map((habit) => (
        <Card
          key={habit.id}
          variant="outlined"
        >
          <View style={styles.row}>
            <Text style={styles.emoji}>{habit.icon}</Text>
            <View style={styles.flex}>
              <Text weight="semibold">{habit.name}</Text>
              <Text
                variant="body3"
                color="secondary"
              >
                {frequencyLabel(habit.frequency)}
              </Text>
              {habit.sync_error && (
                <Text
                  variant="body3"
                  color="error"
                >
                  {habit.sync_error}
                </Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${habit.name}`}
              onPress={() =>
                Alert.alert(
                  'Delete habit?',
                  'The deletion is saved now and synced when online.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void deleteHabit(habit.id),
                    },
                  ]
                )
              }
            >
              <Text color="error">Delete</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      <Text
        variant="heading3"
        weight="semibold"
      >
        Habit templates
      </Text>
      {templates.map((template) => (
        <Card
          key={template.id}
          variant="outlined"
          pressable
          onPress={() =>
            void createHabit({
              templateId: template.id,
              name: template.name,
              icon: template.icon,
              category: template.category,
              type: template.habit_type,
              target: template.default_target,
              unit: template.default_unit,
              frequency: JSON.parse(template.default_frequency) as Record<
                string,
                unknown
              >,
              forgiving: false,
            })
          }
        >
          <View style={styles.row}>
            <Text style={styles.emoji}>{template.icon}</Text>
            <View style={styles.flex}>
              <Text weight="semibold">{template.name}</Text>
              <Text
                color="secondary"
                variant="body3"
              >
                {template.description}
              </Text>
            </View>
            <Text color="primary">Add</Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function frequencyLabel(frequency: string) {
  try {
    const parsed = JSON.parse(frequency) as { kind?: string; target?: number };
    return parsed.kind === 'weekly_target'
      ? `${parsed.target} times each week`
      : parsed.kind === 'weekdays'
        ? 'Selected weekdays'
        : 'Every day';
  } catch {
    return 'Your schedule';
  }
}

const styles = StyleSheet.create({
  emoji: { fontSize: 27 },
  flex: { flex: 1, gap: 3 },
  form: { gap: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
});
