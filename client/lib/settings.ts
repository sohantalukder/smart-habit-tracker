import type {
  GoalPreference,
  Madhab,
  ReligionPreference,
} from "./api/types";

export const settingsSections = [
  "preferences",
  "notifications",
  "prayer",
] as const;

export type SettingsSection = (typeof settingsSections)[number];

export type PrayerSetupPayload = {
  latitude: number;
  longitude: number;
  timezone: string;
  madhab: Madhab;
  calculationMethod: string;
  reminders: Array<{
    prayer: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
    enabled: boolean;
    offsetMinutes: number;
  }>;
};

export type PreferencesPayload = {
  goals: GoalPreference[];
  pace: "light" | "balanced" | "ambitious";
  religion: ReligionPreference;
  dailyDigestTime: string;
  dailyDigestEnabled: boolean;
  prayerSetup: PrayerSetupPayload | null;
};

export type HabitReminderRequest = (
  | { enabled: true; time: string }
  | { enabled: false; time: null }
);

export function parseSettingsSection(value: string | null): SettingsSection {
  return settingsSections.includes(value as SettingsSection)
    ? value as SettingsSection
    : "preferences";
}

export function habitReminderRequest(time: string): HabitReminderRequest {
  return time
    ? { enabled: true, time }
    : { enabled: false, time: null };
}

export function composePreferencesPayload(
  section: SettingsSection,
  draft: PreferencesPayload,
  confirmed: PreferencesPayload,
): PreferencesPayload {
  if (section === "preferences") {
    return {
      ...confirmed,
      goals: draft.goals,
      pace: draft.pace,
    };
  }

  if (section === "notifications") {
    return {
      ...confirmed,
      dailyDigestTime: draft.dailyDigestTime,
      dailyDigestEnabled: draft.dailyDigestEnabled,
    };
  }

  return {
    ...confirmed,
    religion: draft.religion,
    prayerSetup: draft.prayerSetup,
  };
}
