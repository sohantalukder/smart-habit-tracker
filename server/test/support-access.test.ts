import { describe, expect, it, vi } from "vitest";
import {
  isAdminPortalAuthorized,
  requireAdminPortal,
  requireSuperAdmin,
} from "../src/auth/support-access";
import type { AuthenticatedRequest } from "../src/auth/auth.guard";
import type { DatabaseService } from "../src/platform/database.service";

describe("isAdminPortalAuthorized", () => {
  const activeProfile = { suspended_at: null, deleted_at: null };

  it("allows support and super admin roles only", () => {
    expect(isAdminPortalAuthorized("support", activeProfile)).toBe(true);
    expect(isAdminPortalAuthorized("super_admin", activeProfile)).toBe(true);
    expect(isAdminPortalAuthorized("moderator", activeProfile)).toBe(false);
    expect(isAdminPortalAuthorized(null, activeProfile)).toBe(false);
  });

  it("denies administrators whose profile is suspended, deleted, or missing", () => {
    expect(
      isAdminPortalAuthorized("support", { suspended_at: "2026-07-25T00:00:00Z", deleted_at: null }),
    ).toBe(false);
    expect(
      isAdminPortalAuthorized("super_admin", { suspended_at: null, deleted_at: "2026-07-25T00:00:00Z" }),
    ).toBe(false);
    expect(isAdminPortalAuthorized("support", null)).toBe(false);
  });

  it("returns the administrator's real role", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "4245f96d-1a2b-4f3c-9d5e-112233445566",
          email: "admin@example.com",
          name: "Admin",
          role: "super_admin",
          suspended_at: null,
          deleted_at: null,
        }],
      }),
    } as unknown as DatabaseService;
    const request = {
      user: {
        id: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      },
    } as AuthenticatedRequest;

    await expect(requireAdminPortal(request, database)).resolves.toMatchObject({
      role: "super_admin",
    });
  });

  it("keeps sensitive mutations behind the super-admin role", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "4245f96d-1a2b-4f3c-9d5e-112233445566",
          email: "support@example.com",
          name: "Support",
          role: "support",
          suspended_at: null,
          deleted_at: null,
        }],
      }),
    } as unknown as DatabaseService;
    const request = {
      user: { id: "4245f96d-1a2b-4f3c-9d5e-112233445566" },
    } as AuthenticatedRequest;

    await expect(requireSuperAdmin(request, database)).rejects.toMatchObject({
      status: 403,
    });
  });
});
