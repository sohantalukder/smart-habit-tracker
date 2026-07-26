import "server-only";

import { cookies } from "next/headers";
export {
  expiredSessionCookie,
  SESSION_COOKIE,
  sessionCookie,
} from "./session-cookie";
import { SESSION_COOKIE } from "./session-cookie";

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
