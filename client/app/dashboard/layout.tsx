import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { OnboardingFlow } from "@/components/onboarding-flow";
import type { ExperienceProfile } from "@/lib/api/types";
import { getSessionToken } from "@/lib/auth-session";
import { serverApiRequest } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = await getSessionToken();
  if (!token) redirect("/login?returnTo=%2Fdashboard");

  const authResponse = await serverApiRequest("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!authResponse?.ok) redirect("/login?returnTo=%2Fdashboard");

  const profileResponse = await serverApiRequest("/profile", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!profileResponse?.ok) {
    throw new Error("Your profile could not be loaded.");
  }
  const profile = await profileResponse.json() as ExperienceProfile;
  if (!profile.onboarding_completed_at) {
    return <OnboardingFlow initialName={profile.name} />;
  }

  return <DashboardShell initialProfile={profile}>{children}</DashboardShell>;
}
