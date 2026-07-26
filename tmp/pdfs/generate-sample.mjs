import { writeFile } from "node:fs/promises";
import {
  trackingPdfBytes,
} from "./tracking-pdf-bundle.mjs";

const habits = [
  ["Consistent bedtime", "done", "hours"],
  ["Daily steps", "done", "steps"],
  ["Drink water", "done", "glasses"],
  ["Mindful breathing", "done", "minutes"],
  ["Morning stretch", "not_checked", "minutes"],
  ["Read & learn", "not_checked", "minutes"],
];

const days = Array.from({ length: 12 }, (_, index) => {
  const date = `2026-07-${String(index + 1).padStart(2, "0")}`;
  return {
    date,
    completed: 4,
    scheduled: 6,
    completionRate: 67,
    winNote: "Protected the morning routine and stayed focused.",
    reflectionNote: "Prepare water and reading material the night before.",
    habits: habits.map(([name, status, unit], habitIndex) => ({
      id: `habit-${habitIndex}`,
      name,
      icon: "H",
      habit_type: "do",
      target: null,
      unit,
      status,
      value: status === "done" ? 1 : null,
      note: null,
    })),
  };
});

const report = {
  from: "2026-07-01",
  to: "2026-07-12",
  totalCompleted: 48,
  totalScheduled: 72,
  completionRate: 67,
  days,
};

await writeFile(
  new URL("../../output/pdf/bloom-tracking-sample.pdf", import.meta.url),
  trackingPdfBytes(report),
);
