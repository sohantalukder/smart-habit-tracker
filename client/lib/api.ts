export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": crypto.randomUUID(),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "The request could not be completed.");
  }
  return response.json() as Promise<T>;
}

export function idempotentInit(method: "POST" | "PATCH" | "PUT", body?: unknown): RequestInit {
  return {
    method,
    headers: { "idempotency-key": crypto.randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
