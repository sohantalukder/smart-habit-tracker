import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { SupportSession } from "../contracts";
import type { AuthenticatedRequest } from "./auth.guard";
import type { DatabaseService } from "../platform/database.service";

type SupportProfileState = {
  suspended_at?: string | Date | null;
  deleted_at?: string | Date | null;
};

export function isAdminPortalAuthorized(
  role: string | null | undefined,
  profile: SupportProfileState | null | undefined,
) {
  return (
    (role === "support" || role === "super_admin") &&
    Boolean(profile) &&
    !profile?.suspended_at &&
    !profile?.deleted_at
  );
}

export async function requireAdminPortal(
  request: AuthenticatedRequest,
  database: DatabaseService,
): Promise<SupportSession> {
  const result = await database.query<{
    id: string;
    email: string;
    name: string;
    role: string | null;
    suspended_at: Date | null;
    deleted_at: Date | null;
  }>(
    `select p.id, u.email, p.name, m.role, p.suspended_at, p.deleted_at
     from profiles p
     join users u on u.id = p.id
     left join admin_memberships m on m.user_id = p.id
     where p.id = $1`,
    [request.user.id],
  );
  const profile = result.rows[0];
  if (!profile || !isAdminPortalAuthorized(profile.role, profile)) {
    throw new ForbiddenException("This portal is available to approved administrators only.");
  }
  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as SupportSession["role"],
  };
}

export async function requireSuperAdmin(
  request: AuthenticatedRequest,
  database: DatabaseService,
): Promise<SupportSession> {
  const support = await requireAdminPortal(request, database);
  if (support.role !== "super_admin") {
    throw new ForbiddenException("This action requires super-admin access.");
  }
  return support;
}

export function requireIdempotency(request: AuthenticatedRequest) {
  const rawKey = request.headers["idempotency-key"];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    throw new BadRequestException("Idempotency-Key header is required.");
  }
  return key;
}
