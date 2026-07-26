import { NextResponse } from "next/server";
import {
  expiredSessionCookie,
  getSessionToken,
  SESSION_COOKIE,
  sessionCookie,
} from "@/lib/auth-session";
import { isSameOrigin } from "@/lib/request-origin";
import { serverApiRequest } from "@/lib/server-api";

type SessionResponse = {
  accessToken: string;
  expiresAt: string;
};

const publicActions = new Set([
  "signup",
  "login",
  "resend-verification",
  "restore-account",
]);
const privateActions = new Set([
  "change-password",
  "request-email-change",
  "sign-out-others",
  "delete-account",
  "logout",
]);
const sessionActions = new Set(["login", "restore-account"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { code: "ORIGIN_REJECTED", message: "This request origin is not allowed." },
      { status: 403 },
    );
  }

  const { action } = await context.params;
  if (!publicActions.has(action) && !privateActions.has(action)) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "The requested auth action does not exist." },
      { status: 404 },
    );
  }

  const hasBody = !["logout", "sign-out-others"].includes(action);
  const body = hasBody ? await request.text() : undefined;
  const token = privateActions.has(action) ? await getSessionToken() : null;
  if (privateActions.has(action) && !token) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
      { status: 401 },
    );
  }
  const upstream = await serverApiRequest(`/auth/${action}`, {
    method: "POST",
    body,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const payload = await upstream.json().catch(() => ({
    code: "UPSTREAM_ERROR",
    message: "The account service returned an invalid response.",
  }));

  if (upstream.ok && sessionActions.has(action)) {
    const session = payload as SessionResponse;
    const response = NextResponse.json(
      {
        expiresAt: session.expiresAt,
        user: (payload as { user?: unknown }).user,
      },
      { status: upstream.status },
    );
    response.cookies.set(
      SESSION_COOKIE,
      session.accessToken,
      sessionCookie(session.expiresAt),
    );
    response.headers.set("cache-control", "private, no-store, max-age=0");
    return response;
  }

  const response = NextResponse.json(payload, { status: upstream.status });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  if (action === "logout" || (action === "delete-account" && upstream.ok)) {
    response.cookies.set(SESSION_COOKIE, "", expiredSessionCookie());
  }
  return response;
}
