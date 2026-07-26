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
export const journalSchema = z.object({
  winNote: z.string().trim().max(1000).nullable().default(null),
  reflectionNote: z.string().trim().max(1000).nullable().default(null),
});
export const goalPreferenceSchema = z.enum([
  "movement",
  "nutrition",
  "learning",
  "sleep",
  "mindfulness",
]);
export const startingPaceSchema = z.enum(["light", "balanced", "ambitious"]);
export const religionPreferenceSchema = z.enum([
  "muslim",
  "other",
  "unspecified",
]);
export const madhabSchema = z.enum(["hanafi", "shafi", "maliki", "hanbali"]);
export const prayerCalculationMethodSchema = z.enum([
  "karachi",
  "muslim_world_league",
  "egyptian",
  "umm_al_qura",
  "dubai",
  "qatar",
  "kuwait",
  "moonsighting_committee",
  "singapore",
  "turkey",
  "tehran",
  "north_america",
]);
export const prayerNameSchema = z.enum([
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
]);
export const localTimeSchema = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Time must use HH:mm in 24-hour format.",
);
export const prayerReminderSchema = z.object({
  prayer: prayerNameSchema,
  enabled: z.boolean(),
  offsetMinutes: z.number().int().min(0).max(120),
});
export const prayerSetupSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().trim().min(1).max(100),
  madhab: madhabSchema,
  calculationMethod: prayerCalculationMethodSchema,
  reminders: z.array(prayerReminderSchema).length(5).superRefine((reminders, context) => {
    const names = new Set(reminders.map((reminder) => reminder.prayer));
    if (names.size !== 5) {
      context.addIssue({
        code: "custom",
        message: "Each prayer must have exactly one reminder setting.",
      });
    }
  }),
});
const preferenceFields = {
  goals: z.array(goalPreferenceSchema).min(1).max(5).refine(
    (goals) => new Set(goals).size === goals.length,
    "Goals must be unique.",
  ),
  pace: startingPaceSchema,
  religion: religionPreferenceSchema,
  dailyDigestTime: localTimeSchema,
  dailyDigestEnabled: z.boolean().default(true),
  prayerSetup: prayerSetupSchema.nullable(),
};
export const recommendationSchema = z.object({
  goals: preferenceFields.goals,
  pace: preferenceFields.pace,
});
export const onboardingSchema = z.object({
  name: z.string().min(2).max(80),
  units: z.enum(["metric", "imperial"]),
  ...preferenceFields,
  templateIds: z.array(z.uuid()).min(1).max(6).refine(
    (templateIds) => new Set(templateIds).size === templateIds.length,
    "Habit templates must be unique.",
  ),
}).superRefine(validatePrayerSetup);
export const preferencesSchema = z.object(preferenceFields)
  .superRefine(validatePrayerSetup);
export const prayerCheckInSchema = z.object({
  status: z.enum(["on_time", "late", "missed"]),
});
export const habitReminderSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false), time: z.null().optional() }),
  z.object({ enabled: z.literal(true), time: localTimeSchema }),
]);
export const firebaseInstallationSchema = z.object({
  installationId: z.string().trim().min(10).max(255),
  platform: z.literal("web").default("web"),
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
export type JournalInput = z.infer<typeof journalSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type PrayerCheckInInput = z.infer<typeof prayerCheckInSchema>;
export type HabitReminderInput = z.infer<typeof habitReminderSchema>;
export type FirebaseInstallationInput = z.infer<typeof firebaseInstallationSchema>;
export type PrayerSetupInput = z.infer<typeof prayerSetupSchema>;
export type PrayerName = z.infer<typeof prayerNameSchema>;
export type PrayerCalculationMethod = z.infer<typeof prayerCalculationMethodSchema>;
export type Madhab = z.infer<typeof madhabSchema>;

function validatePrayerSetup(
  value: {
    religion: z.infer<typeof religionPreferenceSchema>;
    prayerSetup: z.infer<typeof prayerSetupSchema> | null;
  },
  context: z.RefinementCtx,
) {
  if (value.religion === "muslim" && !value.prayerSetup) {
    context.addIssue({
      code: "custom",
      path: ["prayerSetup"],
      message: "Location and prayer preferences are required for Muslim users.",
    });
  }
  if (value.religion !== "muslim" && value.prayerSetup) {
    context.addIssue({
      code: "custom",
      path: ["prayerSetup"],
      message: "Prayer preferences are available only when religion is Muslim.",
    });
  }
}
