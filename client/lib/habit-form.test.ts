import { describe, expect, it } from "vitest";
import {
  buildCustomHabitPayload,
  type HabitDraft,
  validateHabitDraft,
} from "./habit-form";

const draft: HabitDraft = {
  name: " Read ",
  icon: "📚",
  category: "learning",
  type: "duration",
  target: "20",
  unit: "minutes",
  frequencyKind: "weekdays",
  weekdays: [5, 1, 3],
  weeklyTarget: 3,
  forgiving: true,
};

describe("habit form", () => {
  it("builds the custom habit API payload", () => {
    expect(validateHabitDraft(draft)).toBe("");
    expect(buildCustomHabitPayload(draft)).toEqual({
      name: "Read",
      icon: "📚",
      category: "learning",
      type: "duration",
      target: 20,
      unit: "minutes",
      frequency: { kind: "weekdays", days: [1, 3, 5] },
      forgiving: true,
    });
  });

  it("requires amount tracking details and selected weekdays", () => {
    expect(validateHabitDraft({ ...draft, target: "0" })).toBe(
      "Enter a target greater than zero.",
    );
    expect(validateHabitDraft({ ...draft, weekdays: [] })).toBe(
      "Choose at least one weekday.",
    );
  });
});
