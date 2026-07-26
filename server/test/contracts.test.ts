import { describe, expect, it } from "vitest";
import {
  adminRestrictionSchema,
  adminPasswordChangeSchema,
  adminPrayerSettingsSchema,
  checkInSchema,
  createHabitSchema,
  loginSchema,
  signupSchema,
  supportSessionSchema,
} from "../src/contracts";

describe("REST contracts", () => {
  it("accepts a valid habit", () => {
    expect(createHabitSchema.safeParse({
      name: "Read", icon: "📚", category: "learning", type: "duration",
      target: 20, unit: "minutes", frequency: { kind: "daily" }, forgiving: false,
    }).success).toBe(true);
    expect(createHabitSchema.safeParse({
      templateId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
    }).success).toBe(true);
  });
  it("accepts a check-in", () => {
    expect(checkInSchema.safeParse({ status: "done", value: 20 }).success).toBe(true);
  });
  it("validates first-party signup and login credentials", () => {
    expect(signupSchema.safeParse({
      name: "Bloom User",
      email: "user@example.com",
      password: "long-enough-password",
    }).success).toBe(true);
    expect(loginSchema.safeParse({
      email: "not-an-email",
      password: "password",
    }).success).toBe(false);
  });
  it("accepts support and super admin portal sessions", () => {
    expect(supportSessionSchema.safeParse({
      userId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      email: "support@example.com", name: "Support", role: "support",
    }).success).toBe(true);
    expect(supportSessionSchema.safeParse({
      userId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      email: "admin@example.com", name: "Admin", role: "super_admin",
    }).success).toBe(true);
    expect(supportSessionSchema.safeParse({
      userId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      email: "moderator@example.com", name: "Moderator", role: "moderator",
    }).success).toBe(false);
  });

  it("validates audited restrictions and matching permanent password changes", () => {
    expect(adminRestrictionSchema.safeParse({
      suspended: true,
      reason: "Repeated abuse",
    }).success).toBe(true);
    expect(adminRestrictionSchema.safeParse({
      suspended: true,
      reason: "",
    }).success).toBe(false);
    expect(adminPasswordChangeSchema.safeParse({
      newPassword: "replacement-password",
      confirmation: "replacement-password",
      adminPassword: "admin-password",
    }).success).toBe(true);
    expect(adminPasswordChangeSchema.safeParse({
      newPassword: "replacement-password",
      confirmation: "different-password",
      adminPassword: "admin-password",
    }).success).toBe(false);
    expect(adminPasswordChangeSchema.safeParse({
      legacyPassword: "legacy-password",
      confirmation: "legacy-password",
      adminPassword: "admin-password",
    }).success).toBe(false);
  });

  it("requires complete coordinates and calculation preferences for prayer settings", () => {
    expect(adminPrayerSettingsSchema.safeParse({
      enabled: true,
      latitude: 23.8103,
      longitude: 90.4125,
      madhab: "hanafi",
      calculationMethod: "karachi",
    }).success).toBe(true);
    expect(adminPrayerSettingsSchema.safeParse({
      enabled: true,
      latitude: null,
      longitude: null,
      madhab: null,
      calculationMethod: null,
    }).success).toBe(false);
    expect(adminPrayerSettingsSchema.safeParse({
      enabled: false,
      latitude: null,
      longitude: null,
      madhab: null,
      calculationMethod: null,
    }).success).toBe(true);
  });
});
