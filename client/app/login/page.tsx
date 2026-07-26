import { LoginForm } from "../../components/login-form";
import { authMode, safeReturnTo } from "../../lib/auth-navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    mode?: string;
    verification?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      returnTo={safeReturnTo(params.returnTo)}
      initialMode={authMode(params.mode)}
      verificationFailed={params.verification === "invalid"}
    />
  );
}
