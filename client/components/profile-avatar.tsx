"use client";

import * as Avatar from "@radix-ui/react-avatar";
import type { ExperienceProfile } from "@/lib/api/types";
import { profileInitials } from "@/lib/profile";

export function ProfileAvatar({
  profile,
  size = "medium",
}: {
  profile: ExperienceProfile;
  size?: "small" | "medium" | "large";
}) {
  const source = profile.has_avatar
    ? `/api/backend/profile/avatar?v=${encodeURIComponent(profile.avatar_updated_at ?? "current")}`
    : undefined;
  return (
    <Avatar.Root className={`profile-avatar profile-avatar--${size}`}>
      {source && <Avatar.Image src={source} alt="" className="profile-avatar__image" />}
      <Avatar.Fallback className="profile-avatar__fallback" delayMs={source ? 350 : 0}>
        {profileInitials(profile)}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
