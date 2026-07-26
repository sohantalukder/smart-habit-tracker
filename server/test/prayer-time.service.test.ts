import { describe, expect, it } from "vitest";
import { PrayerTimeService } from "../src/prayer/prayer-time.service";

const service = new PrayerTimeService();
const base = {
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  calculationMethod: "karachi" as const,
};

describe("PrayerTimeService", () => {
  it("applies the later Hanafi Asr rule while preserving the other prayers", async () => {
    const hanafi = await service.calculate("2026-07-26", { ...base, madhab: "hanafi" });
    const shafi = await service.calculate("2026-07-26", { ...base, madhab: "shafi" });
    const hanafiAsr = hanafi.find((prayer) => prayer.name === "asr")!;
    const shafiAsr = shafi.find((prayer) => prayer.name === "asr")!;
    expect(new Date(hanafiAsr.time).getTime()).toBeGreaterThan(
      new Date(shafiAsr.time).getTime(),
    );
    expect(hanafi.find((prayer) => prayer.name === "dhuhr")?.time)
      .toBe(shafi.find((prayer) => prayer.name === "dhuhr")?.time);
  });

  it("rolls the next prayer to tomorrow's Fajr after Isha", async () => {
    const prayers = await service.calculate("2026-07-26", { ...base, madhab: "hanafi" });
    const afterIsha = new Date(
      new Date(prayers.find((prayer) => prayer.name === "isha")!.time).getTime()
      + 60_000,
    );
    const result = await service.withNextPrayer(
      "2026-07-26",
      { ...base, madhab: "hanafi" },
      afterIsha,
    );
    expect(result.nextPrayer?.name).toBe("fajr");
    expect(new Date(result.nextPrayer!.time)).toBeInstanceOf(Date);
  });

  it("returns finite times with the high-latitude fallback", async () => {
    const prayers = await service.calculate("2026-06-21", {
      latitude: 69.6492,
      longitude: 18.9553,
      timezone: "Europe/Oslo",
      madhab: "shafi",
      calculationMethod: "moonsighting_committee",
    });
    expect(prayers).toHaveLength(5);
    expect(prayers.every((prayer) => Number.isFinite(new Date(prayer.time).getTime())))
      .toBe(true);
  });
});
