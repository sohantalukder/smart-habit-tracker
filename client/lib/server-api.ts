import "server-only";

const apiUrl = (
  process.env.API_URL ??
  "http://localhost:4000/v1"
).replace(/\/$/, "");

export async function serverApiRequest(
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": crypto.randomUUID(),
      ...init.headers,
    },
  });
}

export function serverApiUrl(path: string) {
  return `${apiUrl}${path}`;
}
