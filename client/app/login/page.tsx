import { redirect } from "next/navigation";
import { LoginForm } from "../../components/login-form";
import { authMode, safeReturnTo } from "../../lib/auth-navigation";
import { getSessionToken } from "../../lib/auth-session";
import { serverApiRequest } from "../../lib/server-api";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    mode?: string;
    verification?: string;
    emailChange?: string;
  }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const token = await getSessionToken();
  if (token) {
    const response = await serverApiRequest("/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (response?.ok) redirect(returnTo);
  }

  return (
    <LoginForm
      returnTo={returnTo}
      initialMode={authMode(params.mode)}
      verificationFailed={params.verification === "invalid"}
      emailChangeFailed={params.emailChange === "invalid"}
    />
  );
}
