import { redirect } from "next/navigation";
import { LandingPage } from "../components/landing-page";
import { getSessionToken } from "../lib/auth-session";
import { serverApiRequest } from "../lib/server-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = await getSessionToken();
  if (token) {
    const response = await serverApiRequest("/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (response?.ok) redirect("/dashboard");
  }

  return <LandingPage />;
}
