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
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(100).refine(
    isSupportedTimeZone,
    "Select a valid timezone.",
  ),
  units: z.enum(["metric", "imperial"]),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
}).refine(
  (value) => value.currentPassword !== value.newPassword,
  { path: ["newPassword"], message: "Choose a password you have not just used." },
);
export const emailChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newEmail: z.email().max(254),
});
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  confirmation: z.literal("DELETE"),
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
export const adminUserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  timezone: z.string().trim().min(1).max(100).refine(
    isSupportedTimeZone,
    "Select a valid timezone.",
  ),
  units: z.enum(["metric", "imperial"]),
  goals: z.array(goalPreferenceSchema).max(5).refine(
    (goals) => new Set(goals).size === goals.length,
    "Goals must be unique.",
  ),
  pace: startingPaceSchema,
  religion: religionPreferenceSchema,
  dailyDigestTime: localTimeSchema,
  dailyDigestEnabled: z.boolean(),
  role: z.enum(["support", "super_admin"]).nullable(),
});
export const adminRestrictionSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
export const adminPasswordChangeSchema = z.object({
  newPassword: z.string().min(8).max(128),
  confirmation: z.string().min(8).max(128),
  adminPassword: z.string().min(1).max(128),
}).refine(
  (value) => value.newPassword === value.confirmation,
  { path: ["confirmation"], message: "Password confirmation does not match." },
);
export const adminHabitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().min(1).max(8),
  category: habitCategorySchema,
  type: habitTypeSchema,
  target: z.number().positive().nullable(),
  unit: z.string().trim().max(24).nullable(),
  frequency: frequencySchema,
  forgiving: z.boolean(),
  state: z.enum(["active", "paused", "archived"]),
  reminderEnabled: z.boolean().optional(),
  reminderTime: localTimeSchema.nullable().optional(),
});
export const adminCheckInSchema = checkInSchema.extend({
  localDate: z.iso.date(),
});
export const adminJournalSchema = journalSchema.extend({
  localDate: z.iso.date(),
});
export const adminPrayerLogSchema = z.object({
  status: z.enum(["on_time", "late", "missed"]),
  localDate: z.iso.date(),
});
export const adminPrayerReminderSchema = z.object({
  enabled: z.boolean(),
  offsetMinutes: z.number().int().min(0).max(120),
});
export const adminPrayerSettingsSchema = z.object({
  enabled: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  madhab: madhabSchema.nullable(),
  calculationMethod: prayerCalculationMethodSchema.nullable(),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  for (const field of ["latitude", "longitude", "madhab", "calculationMethod"] as const) {
    if (value[field] === null) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `${field} is required when prayer features are enabled.`,
      });
    }
  }
});
export const adminInstallationSchema = z.object({
  active: z.boolean(),
});
export const adminTemplateUpdateSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  category: habitCategorySchema,
  type: habitTypeSchema,
  icon: z.string().min(1).max(8),
  target: z.number().positive().nullable(),
  unit: z.string().trim().max(24).nullable(),
  frequency: frequencySchema,
  goals: z.array(goalPreferenceSchema).max(5).refine(
    (goals) => new Set(goals).size === goals.length,
    "Goals must be unique.",
  ),
  priority: z.number().int().min(0).max(1000),
  active: z.boolean(),
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
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type EmailChangeRequestInput = z.infer<typeof emailChangeRequestSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
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
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminRestrictionInput = z.infer<typeof adminRestrictionSchema>;
export type AdminPasswordChangeInput = z.infer<typeof adminPasswordChangeSchema>;
export type AdminHabitUpdateInput = z.infer<typeof adminHabitUpdateSchema>;
export type AdminCheckInInput = z.infer<typeof adminCheckInSchema>;
export type AdminJournalInput = z.infer<typeof adminJournalSchema>;
export type AdminPrayerLogInput = z.infer<typeof adminPrayerLogSchema>;
export type AdminPrayerReminderInput = z.infer<typeof adminPrayerReminderSchema>;
export type AdminPrayerSettingsInput = z.infer<typeof adminPrayerSettingsSchema>;
export type AdminInstallationInput = z.infer<typeof adminInstallationSchema>;
export type AdminTemplateUpdateInput = z.infer<typeof adminTemplateUpdateSchema>;

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

function isSupportedTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
