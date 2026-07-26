import type { SupportSession } from "./api/types";
import type { AdminUser } from "./queries";

export function buildAdminPasswordPayload(
  newPassword: string,
  confirmation: string,
  adminPassword: string,
) {
  return { newPassword, confirmation, adminPassword };
}

export function adminPageCount(count: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, count) / Math.max(1, pageSize)));
}

export function canRestrictAdminUser(
  support: Pick<SupportSession, "userId" | "role">,
  user: Pick<AdminUser, "id" | "role">,
) {
  if (support.userId === user.id) return false;
  if (user.role && support.role !== "super_admin") return false;
  return true;
}
