import type { components } from "./generated";

export type SupportSession = components["schemas"]["SupportSession"];
export type Profile = components["schemas"]["Profile"];
export type Habit = components["schemas"]["Habit"];
export type HabitTemplate = components["schemas"]["HabitTemplate"];
export type HabitLog = components["schemas"]["HabitLog"];
export type NotificationDelivery = components["schemas"]["NotificationDelivery"];
export type TodayHabit = Habit & { todayLog?: HabitLog | null };
export type GoalPreference =
  | "movement"
  | "nutrition"
  | "learning"
  | "sleep"
  | "mindfulness";
export type ReligionPreference = "muslim" | "other" | "unspecified";
export type Madhab = "hanafi" | "shafi" | "maliki" | "hanbali";
export type PrayerReminderSetting = {
  prayer_name: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
  enabled: boolean;
  offset_minutes: number;
};
export type ExperienceProfile = Profile & {
  onboarding_completed_at?: string | null;
  goal_preferences?: GoalPreference[];
  starting_pace?: "light" | "balanced" | "ambitious";
  religion_preference?: ReligionPreference;
  daily_digest_time?: string;
  daily_digest_enabled?: boolean;
  latitude?: number | string | null;
  longitude?: number | string | null;
  madhab?: Madhab | null;
  prayer_calculation_method?: string | null;
  prayer_reminders?: PrayerReminderSetting[];
  push_enabled?: boolean;
};
export type HabitWithReminder = Habit & {
  reminder_enabled?: boolean;
  reminder_time?: string | null;
};
