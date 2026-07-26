import { LandingPage } from "../components/landing-page";
import { UserDashboard } from "../components/user-dashboard";
import { getSessionToken } from "../lib/auth-session";
import { serverApiRequest } from "../lib/server-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = await getSessionToken();
  if (!token) return <LandingPage />;
  const response = await serverApiRequest("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response?.ok) return <LandingPage />;
  return <UserDashboard />;
}
