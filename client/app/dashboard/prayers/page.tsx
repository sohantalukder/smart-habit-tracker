import { redirect } from "next/navigation";
import { PrayersPage } from "@/components/prayers-page";
import type { ExperienceProfile } from "@/lib/api/types";
import { getSessionToken } from "@/lib/auth-session";
import { serverApiRequest } from "@/lib/server-api";

export default async function DashboardPrayersPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login?returnTo=%2Fdashboard%2Fprayers");
  const response = await serverApiRequest("/profile", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response?.ok) redirect("/dashboard");
  const profile = await response.json() as ExperienceProfile;
  if (profile.religion_preference !== "muslim") redirect("/dashboard");
  return <PrayersPage />;
}
