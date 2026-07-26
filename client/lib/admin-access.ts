import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import type { SupportSession } from "./api/types";
import { getSessionToken } from "./auth-session";
import { serverApiRequest } from "./server-api";

export type AdminAccess =
  | { allowed: true; session: SupportSession }
  | { allowed: false; reason: "forbidden" | "unavailable" };

export async function requireAdminPage(returnTo = "/admin"): Promise<AdminAccess> {
  noStore();
  const token = await getSessionToken();
  if (!token) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);

  try {
    const response = await serverApiRequest("/admin/session", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (response.status === 403) return { allowed: false, reason: "forbidden" };
    if (!response.ok) return { allowed: false, reason: "unavailable" };
    return {
      allowed: true,
      session: (await response.json()) as SupportSession,
    };
  } catch {
    return { allowed: false, reason: "unavailable" };
  }
}
