import { describe, expect, it } from "vitest";
import {
  composePreferencesPayload,
  habitReminderRequest,
  parseSettingsSection,
  type PreferencesPayload,
} from "./settings";

const confirmed: PreferencesPayload = {
  goals: ["movement"],
  pace: "balanced",
  religion: "unspecified",
  dailyDigestTime: "20:00",
  dailyDigestEnabled: true,
  prayerSetup: null,
};

const draft: PreferencesPayload = {
  goals: ["learning", "sleep"],
  pace: "ambitious",
  religion: "muslim",
  dailyDigestTime: "18:30",
  dailyDigestEnabled: false,
  prayerSetup: {
    latitude: 23.81,
    longitude: 90.41,
    timezone: "Asia/Dhaka",
    madhab: "hanafi",
    calculationMethod: "karachi",
    reminders: ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({
      prayer: prayer as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
      enabled: true,
      offsetMinutes: 0,
    })),
  },
};

describe("parseSettingsSection", () => {
  it("accepts supported section names", () => {
    expect(parseSettingsSection("notifications")).toBe("notifications");
    expect(parseSettingsSection("prayer")).toBe("prayer");
  });

  it("defaults missing or invalid values to preferences", () => {
    expect(parseSettingsSection(null)).toBe("preferences");
    expect(parseSettingsSection("account")).toBe("preferences");
  });
});

describe("composePreferencesPayload", () => {
  it("changes only goals and pace for preferences", () => {
    expect(composePreferencesPayload("preferences", draft, confirmed)).toEqual({
      ...confirmed,
      goals: draft.goals,
      pace: draft.pace,
    });
  });

  it("changes only digest fields for notifications", () => {
    expect(composePreferencesPayload("notifications", draft, confirmed)).toEqual({
      ...confirmed,
      dailyDigestTime: draft.dailyDigestTime,
      dailyDigestEnabled: draft.dailyDigestEnabled,
    });
  });

  it("changes only religion and prayer setup for prayer", () => {
    expect(composePreferencesPayload("prayer", draft, confirmed)).toEqual({
      ...confirmed,
      religion: draft.religion,
      prayerSetup: draft.prayerSetup,
    });
  });
});

describe("habitReminderRequest", () => {
  it("enables a reminder when a time is selected", () => {
    expect(habitReminderRequest("07:30")).toEqual({
      enabled: true,
      time: "07:30",
    });
  });

  it("disables a reminder when its time is cleared", () => {
    expect(habitReminderRequest("")).toEqual({
      enabled: false,
      time: null,
    });
  });
});
