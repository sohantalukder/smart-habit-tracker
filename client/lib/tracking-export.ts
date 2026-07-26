import type { TrackingReport } from "./api/types";
import { localDateString } from "./dashboard";

export function offsetLocalDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return localDateString(value);
}

export function trackingCsv(report: TrackingReport) {
  const rows: Array<Array<string | number>> = [
    [
      "Date",
      "Habit",
      "Status",
      "Value",
      "Unit",
      "Daily completion",
      "Today's win",
      "Tomorrow's adjustment",
    ],
    ...report.days.flatMap((day) =>
      day.habits.map((habit) => [
        day.date,
        habit.name,
        habit.status,
        habit.value ?? "",
        habit.unit ?? "",
        `${day.completionRate}%`,
        day.winNote ?? "",
        day.reflectionNote ?? "",
      ])
    ),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function trackingFileName(report: TrackingReport) {
  return `bloom-tracking-${report.from}-to-${report.to}.csv`;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
