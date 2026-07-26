import { describe, expect, it } from "vitest";
import type { Profile, TodayHabit } from "./api/types";
import {
  habitProgress,
  habitProgressLabel,
  localDateString,
  profileDisplayName,
} from "./dashboard";

const habit = {
  id: "habit-1",
  user_id: "user-1",
  name: "Read",
  icon: "R",
  category: "learning",
  habit_type: "duration",
  target: 20,
  unit: "minutes",
  frequency: { kind: "daily" },
  state: "active",
} satisfies TodayHabit;

describe("dashboard presentation", () => {
  it("uses real log values for progress", () => {
    const partial: TodayHabit = {
      ...habit,
      todayLog: {
        id: "log-1",
        habit_id: habit.id,
        user_id: habit.user_id,
        local_date: "2026-07-26",
        status: "partial",
        value: 10,
      },
    };
    expect(habitProgress(partial)).toBe(50);
    expect(habitProgressLabel(partial)).toBe("10 of 20 minutes");
  });

  it("does not invent progress without a log", () => {
    expect(habitProgress(habit)).toBe(0);
    expect(habitProgressLabel(habit)).toBe("Ready when you are");
  });

  it("formats a local date without UTC drift", () => {
    expect(localDateString(new Date(2026, 6, 26, 23, 30))).toBe("2026-07-26");
  });

  it("uses the profile email when a display name is absent", () => {
    const profile = {
      id: "user-1",
      email: "amina@example.com",
      name: " ",
      timezone: "Asia/Dhaka",
      units: "metric",
      account_created_at: "2026-07-26T00:00:00.000Z",
      has_avatar: false,
    } satisfies Profile;
    expect(profileDisplayName(profile)).toBe("amina");
  });
});
