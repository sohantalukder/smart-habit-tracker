import { describe, expect, it } from "vitest";
import type { TrackingReport } from "./api/types";
import {
  offsetLocalDate,
  trackingCsv,
  trackingFileName,
} from "./tracking-export";

const report: TrackingReport = {
  from: "2026-07-20",
  to: "2026-07-26",
  totalCompleted: 1,
  totalScheduled: 1,
  completionRate: 100,
  days: [{
    date: "2026-07-26",
    completed: 1,
    scheduled: 1,
    completionRate: 100,
    winNote: "Focused, calm",
    reflectionNote: "=HYPERLINK(\"unsafe\")",
    habits: [{
      id: "habit-1",
      name: "Read \"deeply\"",
      icon: "📚",
      habit_type: "duration",
      target: 20,
      unit: "minutes",
      status: "done",
      value: 20,
      note: null,
    }],
  }],
};

describe("tracking export", () => {
  it("keeps local dates stable when creating preset ranges", () => {
    expect(offsetLocalDate("2026-07-26", -6)).toBe("2026-07-20");
  });

  it("exports quoted rows and neutralizes spreadsheet formulas", () => {
    const csv = trackingCsv(report);
    expect(csv).toContain("\"Read \"\"deeply\"\"\"");
    expect(csv).toContain("\"Focused, calm\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"unsafe\"\")\"");
  });

  it("uses an explicit date range in the downloaded filename", () => {
    expect(trackingFileName(report)).toBe(
      "bloom-tracking-2026-07-20-to-2026-07-26.csv",
    );
  });
});
