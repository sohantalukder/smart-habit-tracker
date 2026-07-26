export const SESSION_COOKIE = "bloom_session";

export function sessionCookie(
  expiresAt: string,
  production = process.env.NODE_ENV === "production",
) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function expiredSessionCookie(
  production = process.env.NODE_ENV === "production",
) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(0),
  };
}
