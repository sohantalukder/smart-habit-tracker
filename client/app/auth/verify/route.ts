import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth-session";
import { serverApiRequest } from "@/lib/server-api";

type SessionResponse = {
  accessToken: string;
  expiresAt: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return failureRedirect(request.url);

  const upstream = await serverApiRequest("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!upstream.ok) return failureRedirect(request.url);

  const session = await upstream.json() as SessionResponse;
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(
    SESSION_COOKIE,
    session.accessToken,
    sessionCookie(session.expiresAt),
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  return response;
}

function failureRedirect(requestUrl: string) {
  return NextResponse.redirect(
    new URL("/login?verification=invalid", requestUrl),
  );
}
