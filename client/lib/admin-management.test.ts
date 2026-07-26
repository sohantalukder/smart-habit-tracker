import { describe, expect, it } from "vitest";
import {
  adminPageCount,
  buildAdminPasswordPayload,
  canRestrictAdminUser,
} from "./admin-management";

describe("admin management controls", () => {
  it("maps only the permanent password-change fields", () => {
    expect(buildAdminPasswordPayload("new-password", "new-password", "admin-password")).toEqual({
      newPassword: "new-password",
      confirmation: "new-password",
      adminPassword: "admin-password",
    });
  });

  it("calculates safe pagination boundaries", () => {
    expect(adminPageCount(0, 50)).toBe(1);
    expect(adminPageCount(101, 50)).toBe(3);
    expect(adminPageCount(12, 0)).toBe(12);
  });

  it("prevents self-restriction and support restrictions of administrators", () => {
    const support = { userId: "support-1", role: "support" as const };
    const superAdmin = { userId: "admin-1", role: "super_admin" as const };

    expect(canRestrictAdminUser(support, { id: "support-1", role: null })).toBe(false);
    expect(canRestrictAdminUser(support, { id: "admin-2", role: "super_admin" })).toBe(false);
    expect(canRestrictAdminUser(support, { id: "user-1", role: null })).toBe(true);
    expect(canRestrictAdminUser(superAdmin, { id: "admin-2", role: "super_admin" })).toBe(true);
  });
});
