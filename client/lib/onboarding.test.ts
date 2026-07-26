import { describe, expect, it } from "vitest";
import {
  buildOnboardingPayload,
  onboardingStepCount,
} from "./onboarding";

const reminders = ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({
  prayer: prayer as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
  enabled: true,
  offsetMinutes: 0,
}));

describe("onboarding flow helpers", () => {
  it("adds the required prayer step only for Muslim users", () => {
    expect(onboardingStepCount("muslim")).toBe(4);
    expect(onboardingStepCount("other")).toBe(3);
    expect(onboardingStepCount("unspecified")).toBe(3);
  });

  it("includes location and prayer choices only in Muslim payloads", () => {
    const common = {
      name: "Bloom User",
      goals: ["movement", "sleep"] as const,
      pace: "balanced" as const,
      dailyDigestTime: "20:00",
      location: {
        latitude: 23.8103,
        longitude: 90.4125,
        timezone: "Asia/Dhaka",
      },
      madhab: "hanafi" as const,
      calculationMethod: "karachi",
      reminders,
      templateIds: ["template-id"],
    };
    expect(buildOnboardingPayload({
      ...common,
      goals: [...common.goals],
      religion: "muslim",
    }).prayerSetup).toMatchObject({ madhab: "hanafi" });
    expect(buildOnboardingPayload({
      ...common,
      goals: [...common.goals],
      religion: "unspecified",
    }).prayerSetup).toBeNull();
  });
});
