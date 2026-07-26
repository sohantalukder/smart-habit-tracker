import { describe, expect, it } from "vitest";
import {
  isHabitScheduledOnDate,
  zonedLocalDateTimeToDate,
} from "../src/reminders/reminder-scheduler";

describe("reminder scheduling helpers", () => {
  it("converts local reminder times across timezones and DST", () => {
    expect(
      zonedLocalDateTimeToDate("2026-07-26", "08:00", "Asia/Dhaka").toISOString(),
    ).toBe("2026-07-26T02:00:00.000Z");
    expect(
      zonedLocalDateTimeToDate("2026-07-01", "08:00", "America/New_York").toISOString(),
    ).toBe("2026-07-01T12:00:00.000Z");
    expect(
      zonedLocalDateTimeToDate("2026-01-01", "08:00", "America/New_York").toISOString(),
    ).toBe("2026-01-01T13:00:00.000Z");
  });

  it("respects weekday habit schedules", () => {
    expect(isHabitScheduledOnDate(
      { kind: "weekdays", days: [1, 3, 5] },
      "2026-07-27",
    )).toBe(true);
    expect(isHabitScheduledOnDate(
      { kind: "weekdays", days: [1, 3, 5] },
      "2026-07-26",
    )).toBe(false);
  });
});
