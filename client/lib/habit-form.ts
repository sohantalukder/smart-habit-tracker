export type HabitTrackingType = "do" | "avoid" | "count" | "duration";
export type HabitCategory =
  | "diet"
  | "prayer"
  | "steps"
  | "gym"
  | "food"
  | "learning"
  | "other";
export type HabitFrequencyKind = "daily" | "weekdays" | "weekly_target";

export type HabitDraft = {
  name: string;
  icon: string;
  category: HabitCategory;
  type: HabitTrackingType;
  target: string;
  unit: string;
  frequencyKind: HabitFrequencyKind;
  weekdays: number[];
  weeklyTarget: number;
  forgiving: boolean;
};

export function validateHabitDraft(draft: HabitDraft) {
  if (!draft.name.trim()) return "Enter a name for your habit.";
  if (!draft.icon.trim()) return "Choose an icon for your habit.";
  if (
    (draft.type === "count" || draft.type === "duration") &&
    (!Number.isFinite(Number(draft.target)) || Number(draft.target) <= 0)
  ) {
    return "Enter a target greater than zero.";
  }
  if (
    (draft.type === "count" || draft.type === "duration") &&
    !draft.unit.trim()
  ) {
    return "Enter the unit you want to track.";
  }
  if (draft.frequencyKind === "weekdays" && draft.weekdays.length === 0) {
    return "Choose at least one weekday.";
  }
  if (
    draft.frequencyKind === "weekly_target" &&
    (draft.weeklyTarget < 1 || draft.weeklyTarget > 7)
  ) {
    return "Choose a weekly target between 1 and 7.";
  }
  return "";
}

export function buildCustomHabitPayload(draft: HabitDraft) {
  const tracksAmount = draft.type === "count" || draft.type === "duration";
  const frequency =
    draft.frequencyKind === "weekdays"
      ? { kind: "weekdays" as const, days: [...draft.weekdays].sort() }
      : draft.frequencyKind === "weekly_target"
        ? { kind: "weekly_target" as const, target: draft.weeklyTarget }
        : { kind: "daily" as const };

  return {
    name: draft.name.trim(),
    icon: draft.icon.trim(),
    category: draft.category,
    type: draft.type,
    target: tracksAmount ? Number(draft.target) : null,
    unit: tracksAmount ? draft.unit.trim() : null,
    frequency,
    forgiving: draft.forgiving,
  };
}
