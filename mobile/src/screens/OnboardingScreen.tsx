import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from '@sohantalukder/rn-kit';
import { useApp } from '@/app/AppProvider';
import { Screen } from '@/components/Screen';
import { completeOnboarding } from '@/database/repository';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type Template = {
  id: string;
  name: string;
  description: string;
  icon: string;
  goal_tags: string;
};

const queryParameters: [] = [];
const templateTables = ['habit_templates'];
const goals = ['movement', 'nutrition', 'learning', 'sleep', 'mindfulness'];
const choiceBorder = '#D7DDD8';
const selectedBackground = '#EDF7EF';
const selectedBorder = '#6A8D73';
const templateBorder = '#E0E5E1';

export function OnboardingScreen() {
  const { session, refreshSession } = useApp();
  const [name, setName] = useState(session?.user.name ?? '');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['movement']);
  const [pace, setPace] = useState<'light' | 'balanced' | 'ambitious'>(
    'balanced'
  );
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [religion, setReligion] = useState<'muslim' | 'other' | 'unspecified'>(
    'unspecified'
  );
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: templates } = useReactiveQuery<Template>(
    'select id,name,description,icon,goal_tags from habit_templates order by recommendation_priority limit 20',
    queryParameters,
    templateTables
  );
  const recommendations = useMemo(
    () =>
      templates.filter((template) => {
        const tags = JSON.parse(template.goal_tags) as string[];
        return tags.some((tag) => selectedGoals.includes(tag));
      }),
    [selectedGoals, templates]
  );

  function toggleGoal(goal: string) {
    setSelectedGoals((current) =>
      current.includes(goal)
        ? current.filter((item) => item !== goal)
        : [...current, goal]
    );
    setSelectedTemplates([]);
  }

  async function finish() {
    if (!session || !selectedTemplates.length) return;
    setBusy(true);
    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    await completeOnboarding(
      { id: session.user.id, email: session.user.email },
      {
        name: name.trim(),
        units,
        goals: selectedGoals,
        pace,
        religion,
        dailyDigestTime: '20:00',
        dailyDigestEnabled: true,
        prayerSetup:
          religion === 'muslim'
            ? {
                latitude: 23.8103,
                longitude: 90.4125,
                timezone: 'Asia/Dhaka',
                madhab: 'hanafi',
                calculationMethod: 'karachi',
                reminders: prayers.map((prayer) => ({
                  prayer,
                  enabled: true,
                  offsetMinutes: 0,
                })),
              }
            : null,
        templateIds: selectedTemplates,
      }
    );
    await refreshSession({
      ...session,
      user: { ...session.user, name: name.trim(), onboardingCompleted: true },
    });
    setBusy(false);
  }

  return (
    <Screen
      title="Shape your Bloom"
      subtitle="These choices work offline and can be changed later."
    >
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            About you
          </Text>
          <TextInput
            label="Display name"
            value={name}
            onChangeText={setName}
          />
          <ChoiceRow
            values={['metric', 'imperial']}
            selected={units}
            onPress={(value) => setUnits(value as typeof units)}
          />
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            What matters now?
          </Text>
          <View style={styles.wrap}>
            {goals.map((goal) => (
              <Chip
                key={goal}
                label={goal}
                selected={selectedGoals.includes(goal)}
                onPress={() => toggleGoal(goal)}
              />
            ))}
          </View>
          <Text weight="medium">Starting pace</Text>
          <ChoiceRow
            values={['light', 'balanced', 'ambitious']}
            selected={pace}
            onPress={(value) => setPace(value as typeof pace)}
          />
          <Text weight="medium">Religion & prayer tools</Text>
          <ChoiceRow
            values={['unspecified', 'muslim', 'other']}
            selected={religion}
            onPress={(value) => setReligion(value as typeof religion)}
          />
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Choose starter habits
          </Text>
          {recommendations.map((template) => (
            <Pressable
              key={template.id}
              onPress={() =>
                setSelectedTemplates((current) =>
                  current.includes(template.id)
                    ? current.filter((id) => id !== template.id)
                    : current.length < 6
                      ? [...current, template.id]
                      : current
                )
              }
              style={[
                styles.template,
                selectedTemplates.includes(template.id) && styles.selected,
              ]}
            >
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
            </Pressable>
          ))}
          {!recommendations.length && (
            <Text color="secondary">
              Syncing the habit catalog. Pull down to try again.
            </Text>
          )}
        </View>
      </Card>
      <Button
        text="Start my practice"
        isLoading={busy}
        disabled={
          busy ||
          name.trim().length < 2 ||
          !selectedGoals.length ||
          !selectedTemplates.length
        }
        onPress={() => void finish()}
      />
    </Screen>
  );
}

function ChoiceRow({
  values,
  selected,
  onPress,
}: {
  values: string[];
  selected: string;
  onPress: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      {values.map((value) => (
        <Pressable
          key={value}
          onPress={() => onPress(value)}
          style={[styles.choice, selected === value && styles.selected]}
        >
          <Text weight={selected === value ? 'semibold' : 'regular'}>
            {value.replace(/_/g, ' ')}
          </Text>
        </Pressable>
      ))}
    </View>
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
      style={[styles.choice, selected && styles.selected]}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  choice: {
    borderColor: choiceBorder,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  emoji: { fontSize: 26 },
  flex: { flex: 1, gap: 2 },
  selected: {
    backgroundColor: selectedBackground,
    borderColor: selectedBorder,
  },
  template: {
    alignItems: 'center',
    borderColor: templateBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
