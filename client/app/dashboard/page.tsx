import { redirect } from "next/navigation";
import { OnboardingFlow } from "../../components/onboarding-flow";
import { UserDashboard } from "../../components/user-dashboard";
import { getSessionToken } from "../../lib/auth-session";
import { serverApiRequest } from "../../lib/server-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login?returnTo=%2Fdashboard");

  const authResponse = await serverApiRequest("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!authResponse?.ok) redirect("/login?returnTo=%2Fdashboard");

  const profileResponse = await serverApiRequest("/profile", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (profileResponse?.ok) {
    const profile = await profileResponse.json() as {
      name: string;
      onboarding_completed_at?: string | null;
    };
    if (!profile.onboarding_completed_at) {
      return <OnboardingFlow initialName={profile.name} />;
    }
  }

  return <UserDashboard />;
}
