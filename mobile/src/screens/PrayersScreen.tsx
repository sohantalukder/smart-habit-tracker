import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from '@sohantalukder/rn-kit';
import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Shafaq,
} from 'adhan';
import { Screen } from '@/components/Screen';
import { savePrayerLog } from '@/database/repository';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type Preference = {
  latitude: number;
  longitude: number;
  madhab: string;
  calculation_method: string;
};
type PrayerLog = { prayer_name: string; status: string };
const names = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

export function PrayersScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const empty = useMemo(() => [], []);
  const dateParameters = useMemo(() => [today], [today]);
  const preferenceTables = useMemo(() => ['preferences'], []);
  const logTables = useMemo(() => ['prayer_logs'], []);
  const { data: preferences } = useReactiveQuery<Preference>(
    `select latitude,longitude,madhab,calculation_method from preferences
     where religion='muslim' limit 1`,
    empty,
    preferenceTables
  );
  const { data: logs } = useReactiveQuery<PrayerLog>(
    `select prayer_name,status from prayer_logs
     where local_date=? and deleted_at is null`,
    dateParameters,
    logTables
  );
  const preference = preferences[0];
  const schedule = useMemo(
    () => (preference ? calculatePrayers(preference) : []),
    [preference]
  );

  return (
    <Screen
      title="Prayers"
      subtitle="Times are calculated locally and work without a network."
    >
      {schedule.map((prayer) => {
        const status = logs.find(
          (item) => item.prayer_name === prayer.name
        )?.status;
        return (
          <Card
            key={prayer.name}
            variant="outlined"
            pressable
            onPress={() => void savePrayerLog(prayer.name, today, 'on_time')}
            {...(status ? { borderColor: '#6A8D73' } : {})}
          >
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text
                  variant="heading3"
                  weight="semibold"
                >
                  {prayer.name[0]?.toUpperCase()}
                  {prayer.name.slice(1)}
                </Text>
                <Text color="secondary">{prayer.time}</Text>
              </View>
              <Text color={status ? 'success' : 'secondary'}>
                {status ? status.replace('_', ' ') : 'Track'}
              </Text>
            </View>
          </Card>
        );
      })}
      {!preference && (
        <Card variant="outlined">
          <Text weight="semibold">Prayer setup is not enabled.</Text>
          <Text color="secondary">
            Choose Muslim and add your location in Settings.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function calculatePrayers(preference: Preference) {
  const coordinates = new Coordinates(
    Number(preference.latitude),
    Number(preference.longitude)
  );
  const parameters = method(preference.calculation_method);
  const hanafi = preference.madhab === 'hanafi';
  parameters.madhab = hanafi ? Madhab.Hanafi : Madhab.Shafi;
  parameters.shafaq = hanafi ? Shafaq.Abyad : Shafaq.Ahmer;
  parameters.highLatitudeRule = HighLatitudeRule.recommended(coordinates);
  parameters.polarCircleResolution = PolarCircleResolution.AqrabYaum;
  const times = new PrayerTimes(coordinates, new Date(), parameters);
  return names.map((name) => ({
    name,
    time: times[name].toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
  }));
}

function method(value: string) {
  const methods: Record<
    string,
    () => ReturnType<typeof CalculationMethod.Karachi>
  > = {
    muslim_world_league: CalculationMethod.MuslimWorldLeague,
    egyptian: CalculationMethod.Egyptian,
    umm_al_qura: CalculationMethod.UmmAlQura,
    dubai: CalculationMethod.Dubai,
    qatar: CalculationMethod.Qatar,
    kuwait: CalculationMethod.Kuwait,
    moonsighting_committee: CalculationMethod.MoonsightingCommittee,
    singapore: CalculationMethod.Singapore,
    turkey: CalculationMethod.Turkey,
    tehran: CalculationMethod.Tehran,
    north_america: CalculationMethod.NorthAmerica,
    karachi: CalculationMethod.Karachi,
  };
  return (methods[value] ?? CalculationMethod.Karachi)();
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 3 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
});
