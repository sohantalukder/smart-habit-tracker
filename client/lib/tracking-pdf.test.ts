import { describe, expect, it } from "vitest";
import type { TrackingReport } from "./api/types";
import {
  createTrackingPdf,
  trackingPdfBytes,
  trackingPdfFileName,
} from "./tracking-pdf";

const days = Array.from({ length: 14 }, (_, dayIndex) => ({
  date: `2026-07-${String(dayIndex + 1).padStart(2, "0")}`,
  completed: 4,
  scheduled: 6,
  completionRate: 67,
  winNote: "Protected the morning routine and stayed focused.",
  reflectionNote: "Prepare water and reading material the night before.",
  habits: Array.from({ length: 6 }, (_, habitIndex) => ({
    id: `habit-${habitIndex}`,
    name: `Daily habit ${habitIndex + 1}`,
    icon: "H",
    habit_type: "do" as const,
    target: null,
    unit: null,
    status: habitIndex < 4 ? "done" as const : "not_checked" as const,
    value: null,
    note: null,
  })),
}));

const report: TrackingReport = {
  from: "2026-07-01",
  to: "2026-07-14",
  totalCompleted: 56,
  totalScheduled: 84,
  completionRate: 67,
  days,
};

describe("branded tracking PDF", () => {
  it("creates a multi-page PDF with Bloom document metadata", () => {
    const document = createTrackingPdf(report);
    expect(document.getNumberOfPages()).toBeGreaterThan(1);
    const source = document.output();
    expect(source).toContain("/Author (Bloom)");
    expect(source).toContain("/Creator (Bloom)");
    expect(source).toContain("/Subject (Private habit tracking report)");
  });

  it("returns a valid PDF payload and branded filename", () => {
    const bytes = trackingPdfBytes(report);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(trackingPdfFileName(report)).toBe(
      "bloom-tracking-2026-07-01-to-2026-07-14.pdf",
    );
  });
});
