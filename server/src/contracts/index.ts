import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export const emailSchema = z.object({
  email: z.email().max(254),
});
export const verificationSchema = z.object({
  token: z.string().min(32).max(200),
});
export const adminRoleSchema = z.enum(["support", "moderator", "super_admin"]);
export const supportSessionSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(["support", "super_admin"]),
});
export const habitTypeSchema = z.enum(["do", "avoid", "count", "duration"]);
export const habitCategorySchema = z.enum([
  "diet", "prayer", "steps", "gym", "food", "learning", "other",
]);
export const frequencySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekly_target"), target: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).min(1) }),
]);
export const customHabitSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().min(1).max(8),
  category: habitCategorySchema,
  type: habitTypeSchema,
  target: z.number().positive().nullable().default(null),
  unit: z.string().max(24).nullable().default(null),
  frequency: frequencySchema,
  forgiving: z.boolean().default(false),
});
export const templateHabitSchema = z.object({
  templateId: z.uuid(),
});
export const createHabitSchema = z.union([
  templateHabitSchema,
  customHabitSchema,
]);
export const checkInSchema = z.object({
  status: z.enum(["done", "skipped", "partial"]),
  value: z.number().nonnegative().nullable().default(null),
  note: z.string().max(1000).nullable().default(null),
  prayerStatus: z.enum(["on_time", "late", "missed"]).nullable().default(null),
});
export const onboardingSchema = z.object({
  name: z.string().min(2).max(80),
  timezone: z.string().min(1),
  units: z.enum(["metric", "imperial"]),
  faithPreference: z.enum(["none", "muslim"]),
  prayerEnabled: z.boolean(),
  templateIds: z.array(z.uuid()),
});
export const announcementSchema = z.object({
  title: z.string().min(2).max(100),
  body: z.string().min(2).max(1000),
  channels: z.array(z.enum(["push", "email", "in_app"])).min(1),
});
export const errorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  correlationId: z.string(),
  retryable: z.boolean(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type SupportSession = z.infer<typeof supportSessionSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
