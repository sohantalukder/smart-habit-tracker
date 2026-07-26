import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth-session";
import { isSameOrigin } from "@/lib/request-origin";
import { serverApiUrl } from "@/lib/server-api";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context) {
  if (!["GET", "HEAD"].includes(request.method) && !isSameOrigin(request)) {
    return NextResponse.json(
      { code: "ORIGIN_REJECTED", message: "This request origin is not allowed." },
      { status: 403 },
    );
  }
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const source = new URL(request.url);
  const upstreamUrl = new URL(
    `${serverApiUrl("/")}${path.map(encodeURIComponent).join("/")}`,
  );
  upstreamUrl.search = source.search;
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-correlation-id":
      request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
  });
  for (const name of ["content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    cache: "no-store",
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
  });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "x-correlation-id"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
