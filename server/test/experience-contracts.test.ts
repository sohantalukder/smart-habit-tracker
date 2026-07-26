import { describe, expect, it } from "vitest";
import {
  onboardingSchema,
  preferencesSchema,
} from "../src/contracts";

const reminders = ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({
  prayer,
  enabled: true,
  offsetMinutes: 0,
}));

const base = {
  goals: ["movement", "sleep"],
  pace: "balanced",
  dailyDigestTime: "20:00",
  dailyDigestEnabled: true,
};

describe("preference and onboarding contracts", () => {
  it("requires location and prayer choices for Muslim users", () => {
    expect(preferencesSchema.safeParse({
      ...base,
      religion: "muslim",
      prayerSetup: null,
    }).success).toBe(false);

    expect(preferencesSchema.safeParse({
      ...base,
      religion: "muslim",
      prayerSetup: {
        latitude: 23.8103,
        longitude: 90.4125,
        timezone: "Asia/Dhaka",
        madhab: "hanafi",
        calculationMethod: "karachi",
        reminders,
      },
    }).success).toBe(true);
  });

  it("rejects prayer setup for non-Muslim and duplicate template choices", () => {
    const prayerSetup = {
      latitude: 23.8103,
      longitude: 90.4125,
      timezone: "Asia/Dhaka",
      madhab: "hanafi",
      calculationMethod: "karachi",
      reminders,
    };
    expect(preferencesSchema.safeParse({
      ...base,
      religion: "other",
      prayerSetup,
    }).success).toBe(false);
    expect(onboardingSchema.safeParse({
      ...base,
      name: "Bloom User",
      units: "metric",
      religion: "other",
      prayerSetup: null,
      templateIds: [
        "4245f96d-1a2b-4f3c-9d5e-112233445566",
        "4245f96d-1a2b-4f3c-9d5e-112233445566",
      ],
    }).success).toBe(false);
  });
});
