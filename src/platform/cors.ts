type CorsEnvironment = {
  NODE_ENV?: string;
  ALLOWED_ORIGINS?: string;
  VERCEL_PROJECT_SLUG?: string;
  VERCEL_TEAM_SLUG?: string;
};

export function createOriginPolicy(environment: CorsEnvironment) {
  const allowed = new Set(
    (environment.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

  return (origin: string | undefined) => {
    // Native apps, server-to-server requests, and health checks do not send
    // the browser Origin header. Authentication is still required by guards.
    if (!origin) return true;
    const normalized = origin.replace(/\/$/, "");
    if (allowed.has(normalized)) return true;
    if (environment.NODE_ENV === "production") return false;

    const project = environment.VERCEL_PROJECT_SLUG?.trim();
    const team = environment.VERCEL_TEAM_SLUG?.trim();
    if (!project || !team) return false;

    try {
      const url = new URL(normalized);
      return (
        url.protocol === "https:" &&
        url.hostname.startsWith(`${project}-`) &&
        url.hostname.endsWith(`-${team}.vercel.app`)
      );
    } catch {
      return false;
    }
  };
}
