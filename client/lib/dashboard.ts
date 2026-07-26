import type { Profile, TodayHabit } from "./api/types";

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function habitProgress(habit: TodayHabit) {
  const log = habit.todayLog;
  if (!log || log.status === "skipped") return 0;
  if (log.status === "done") return 100;
  if (habit.target && log.value != null) {
    return Math.min(100, Math.round((Number(log.value) / Number(habit.target)) * 100));
  }
  return 50;
}

export function habitProgressLabel(habit: TodayHabit) {
  const log = habit.todayLog;
  if (!log) return "Ready when you are";
  if (log.status === "done") return "Complete for today";
  if (log.status === "skipped") return "Intentionally skipped";
  if (habit.target && log.value != null) {
    return `${log.value} of ${habit.target}${habit.unit ? ` ${habit.unit}` : ""}`;
  }
  return "Partially complete";
}

export function profileDisplayName(profile: Profile) {
  const name = profile.name.trim();
  if (name) return name;
  return profile.email.split("@")[0] || "Bloom member";
}
