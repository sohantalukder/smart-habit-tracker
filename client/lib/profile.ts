import type { ExperienceProfile } from "./api/types";
import { profileDisplayName } from "./dashboard";

export function profileInitials(profile: ExperienceProfile) {
  const words = profileDisplayName(profile)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "B";
}
