import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '@sohantalukder/rn-kit';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import HtmlToPdf from 'react-native-html-to-pdf';
import { Screen } from '@/components/Screen';
import { useReactiveQuery } from '@/database/useReactiveQuery';

type HistoryRow = {
  local_date: string;
  completed: number;
  total: number;
};

export function HistoryScreen() {
  const [days, setDays] = useState(30);
  const from = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - days + 1);
    return date.toISOString().slice(0, 10);
  }, [days]);
  const parameters = useMemo(() => [from], [from]);
  const tables = useMemo(() => ['habit_logs', 'habits'], []);
  const { data } = useReactiveQuery<HistoryRow>(
    `select l.local_date,
       sum(case when l.status='done' and l.deleted_at is null then 1 else 0 end) completed,
       count(*) total
     from habit_logs l join habits h on h.id=l.habit_id
     where l.local_date>=? and h.deleted_at is null
     group by l.local_date order by l.local_date desc`,
    parameters,
    tables
  );
  const completed = data.reduce((sum, row) => sum + Number(row.completed), 0);
  const total = data.reduce((sum, row) => sum + Number(row.total), 0);
  const rate = total ? Math.round((completed / total) * 100) : 0;

  async function shareCsv() {
    const csv = [
      'date,completed,tracked,completion_rate',
      ...data.map((row) => {
        const rowRate = row.total
          ? Math.round((Number(row.completed) / Number(row.total)) * 100)
          : 0;
        return `${row.local_date},${row.completed},${row.total},${rowRate}`;
      }),
    ].join('\n');
    const path = `${RNFS.CachesDirectoryPath}/bloom-history-${from}.csv`;
    await RNFS.writeFile(path, csv, 'utf8');
    await Share.open({
      url: `file://${path}`,
      type: 'text/csv',
      filename: 'Bloom history',
    });
  }

  async function sharePdf() {
    const rows = data
      .map(
        (row) =>
          `<tr><td>${row.local_date}</td><td>${row.completed}</td><td>${row.total}</td></tr>`
      )
      .join('');
    const pdf = await HtmlToPdf.convert({
      fileName: `bloom-history-${from}`,
      directory: 'Documents',
      html: `<html><body><h1>Bloom habit history</h1>
        <p>${rate}% completion across the selected period.</p>
        <table border="1" cellspacing="0" cellpadding="8">
        <tr><th>Date</th><th>Completed</th><th>Tracked</th></tr>${rows}</table>
        </body></html>`,
    });
    if (pdf.filePath) {
      await Share.open({
        url: `file://${pdf.filePath}`,
        type: 'application/pdf',
        filename: 'Bloom history',
      });
    }
  }

  return (
    <Screen
      title="History"
      subtitle="Generated entirely from your local records."
    >
      <View style={styles.filters}>
        {[7, 30, 90].map((value) => (
          <Button
            key={value}
            text={`${value} days`}
            variant={days === value ? 'primary' : 'outline'}
            onPress={() => setDays(value)}
          />
        ))}
      </View>
      <Card backgroundColor="#183B2B">
        <View style={styles.summary}>
          <Text
            color="white"
            variant="heading1"
            weight="bold"
          >
            {rate}%
          </Text>
          <Text color="white">{completed} completed check-ins</Text>
        </View>
      </Card>
      <View style={styles.filters}>
        <Button
          text="Share CSV"
          variant="outline"
          onPress={() => void shareCsv()}
        />
        <Button
          text="Share PDF"
          variant="outline"
          onPress={() => void sharePdf()}
        />
      </View>
      {data.map((row) => (
        <Card
          key={row.local_date}
          variant="outlined"
        >
          <View style={styles.row}>
            <Text weight="semibold">
              {new Date(`${row.local_date}T12:00:00`).toLocaleDateString(
                undefined,
                {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }
              )}
            </Text>
            <Text color="secondary">
              {row.completed} / {row.total}
            </Text>
          </View>
        </Card>
      ))}
      {!data.length && (
        <Card variant="outlined">
          <Text weight="semibold">No records in this range yet.</Text>
          <Text color="secondary">
            Your offline check-ins will appear here instantly.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  summary: { gap: 4 },
});
