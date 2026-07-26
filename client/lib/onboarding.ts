import type {
  GoalPreference,
  Madhab,
  ReligionPreference,
} from "./api/types";

export type OnboardingPrayerReminder = {
  prayer: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
  enabled: boolean;
  offsetMinutes: number;
};

export type OnboardingLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
};

export function onboardingStepCount(religion: ReligionPreference) {
  return religion === "muslim" ? 4 : 3;
}

export function buildOnboardingPayload(input: {
  name: string;
  goals: GoalPreference[];
  pace: "light" | "balanced" | "ambitious";
  religion: ReligionPreference;
  dailyDigestTime: string;
  location: OnboardingLocation | null;
  madhab: Madhab;
  calculationMethod: string;
  reminders: OnboardingPrayerReminder[];
  templateIds: string[];
}) {
  return {
    name: input.name,
    units: "metric" as const,
    goals: input.goals,
    pace: input.pace,
    religion: input.religion,
    dailyDigestTime: input.dailyDigestTime,
    dailyDigestEnabled: true,
    prayerSetup: input.religion === "muslim" && input.location
      ? {
          ...input.location,
          madhab: input.madhab,
          calculationMethod: input.calculationMethod,
          reminders: input.reminders,
        }
      : null,
    templateIds: input.templateIds,
  };
}
