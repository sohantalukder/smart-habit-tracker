export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("x-correlation-id")) {
    headers.set("x-correlation-id", crypto.randomUUID());
  }
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiRequestError(
      body?.message ?? "The request could not be completed.",
      body?.code,
      body?.fieldErrors,
      body?.details,
    );
  }
  return response.json() as Promise<T>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly fieldErrors?: Record<string, string[]>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function idempotentInit(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): RequestInit {
  return {
    method,
    headers: { "idempotency-key": crypto.randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
