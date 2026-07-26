import { LandingPage } from "../components/landing-page";
import { UserDashboard } from "../components/user-dashboard";
import { getSessionToken } from "../lib/auth-session";
import { serverApiRequest } from "../lib/server-api";
import { OnboardingFlow } from "../components/onboarding-flow";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = await getSessionToken();
  if (!token) return <LandingPage />;
  const response = await serverApiRequest("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response?.ok) return <LandingPage />;
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
