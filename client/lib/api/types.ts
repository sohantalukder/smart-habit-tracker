import type { components } from "./generated";

export type SupportSession = components["schemas"]["SupportSession"];
export type Profile = components["schemas"]["Profile"];
export type Habit = components["schemas"]["Habit"];
export type HabitTemplate = components["schemas"]["HabitTemplate"];
export type HabitLog = components["schemas"]["HabitLog"];
export type NotificationDelivery = components["schemas"]["NotificationDelivery"];
export type TodayHabit = Habit & { todayLog?: HabitLog | null };
