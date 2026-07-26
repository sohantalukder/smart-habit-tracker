import { describe, expect, it } from "vitest";
import type { ExperienceProfile } from "./api/types";
import { profileInitials } from "./profile";

const profile = {
  id: "user-1",
  email: "sohan@example.com",
  name: "Md. Sohan Talukder",
  timezone: "Asia/Dhaka",
  units: "metric",
  account_created_at: "2026-07-26T00:00:00.000Z",
  has_avatar: false,
} satisfies ExperienceProfile;

describe("profile identity", () => {
  it("uses at most two stable initials for avatar fallbacks", () => {
    expect(profileInitials(profile)).toBe("MS");
  });

  it("falls back to the email identity when a name is blank", () => {
    expect(profileInitials({ ...profile, name: " " })).toBe("S");
  });
});
