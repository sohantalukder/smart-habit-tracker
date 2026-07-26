import { describe, expect, it, vi } from "vitest";
import { AdminController } from "../src/admin.controller";
import { hashPassword, verifyPassword } from "../src/auth/password";
import type { AuthenticatedRequest } from "../src/auth/auth.guard";
import type { VerificationEmailService } from "../src/auth/verification-email.service";
import type { AuditService } from "../src/platform/audit.service";
import type { DatabaseService } from "../src/platform/database.service";
import type { QueueService } from "../src/platform/queue.service";

const actorId = "4245f96d-1a2b-4f3c-9d5e-112233445566";
const targetId = "5245f96d-1a2b-4f3c-9d5e-112233445566";

function request(): AuthenticatedRequest {
  return {
    user: { id: actorId },
    correlationId: "correlation-1",
    headers: { "idempotency-key": "operation-1" },
  } as AuthenticatedRequest;
}

function adminProfile() {
  return {
    id: actorId,
    email: "admin@example.com",
    name: "Admin",
    role: "super_admin",
    suspended_at: null,
    deleted_at: null,
  };
}

describe("AdminController security mutations", () => {
  it("changes a password permanently, revokes sessions, and redacts audit metadata", async () => {
    const actorHash = await hashPassword("administrator-password");
    const targetHash = await hashPassword("current-user-password");
    let writtenHash = "";
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("update users")) {
          writtenHash = String(params?.[1] ?? "");
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("update user_sessions")) {
          return { rows: [{ id: "session-1" }, { id: "session-2" }], rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("from profiles p") && sql.includes("admin_memberships")) {
          return { rows: [adminProfile()] };
        }
        if (sql.includes("from idempotency_records")) return { rows: [] };
        if (sql.includes("select password_hash from users")) {
          return { rows: [{ password_hash: actorHash }] };
        }
        if (sql.includes("select email, password_hash from users")) {
          return {
            rows: [{ email: "user@example.com", password_hash: targetHash }],
          };
        }
        return { rows: [], rowCount: 1, params };
      }),
      transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) =>
        work(client)),
    } as unknown as DatabaseService;
    const auditRecord = vi.fn();
    const audit = { record: auditRecord } as unknown as AuditService;
    const email = { sendSecurityNotice: vi.fn() } as unknown as VerificationEmailService;
    const controller = new AdminController(
      database,
      audit,
      {} as unknown as QueueService,
      email,
    );

    await expect(controller.changeUserPassword(request(), targetId, {
      adminPassword: "administrator-password",
      newPassword: "replacement-user-password",
      confirmation: "replacement-user-password",
    })).resolves.toEqual({ changed: true, sessionsRevoked: 2 });

    expect(await verifyPassword("replacement-user-password", writtenHash)).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("update user_sessions"),
      [targetId],
    );
    expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.password_changed_by_admin",
      metadata: { sessionsRevoked: 2 },
    }));
    const auditMetadata = auditRecord.mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(auditMetadata)).not.toContain("replacement-user-password");
    expect(JSON.stringify(auditMetadata)).not.toContain("administrator-password");
    expect(email.sendSecurityNotice).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String),
      expect.not.stringContaining("replacement-user-password"),
    );
  });

  it("protects the last active super admin from restriction", async () => {
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("select p.id, u.email") && sql.includes("admin_memberships")) {
          return { rows: [adminProfile()] };
        }
        if (sql.includes("from idempotency_records")) return { rows: [] };
        if (sql.includes("select m.role") && sql.includes("from profiles p")) {
          return { rows: [{ role: "super_admin" }] };
        }
        if (sql.includes("select count(*)::int as count")) {
          return { rows: [{ count: 0 }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseService;
    const controller = new AdminController(
      database,
      { record: vi.fn() } as unknown as AuditService,
      {} as unknown as QueueService,
      {} as VerificationEmailService,
    );

    await expect(controller.updateUser(request(), targetId, {
      suspended: true,
      reason: "Security review",
    })).rejects.toMatchObject({ status: 409 });
  });

  it("assigns an administrator role through the dedicated audited endpoint", async () => {
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("select p.id, u.email") && sql.includes("admin_memberships")) {
          return { rows: [adminProfile()] };
        }
        if (sql.includes("from idempotency_records")) return { rows: [] };
        if (sql.includes("select m.role") && sql.includes("from profiles p")) {
          return { rows: [{ role: null }] };
        }
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as DatabaseService;
    const auditRecord = vi.fn();
    const controller = new AdminController(
      database,
      { record: auditRecord } as unknown as AuditService,
      {} as unknown as QueueService,
      {} as VerificationEmailService,
    );

    await expect(controller.updateUserRole(request(), targetId, {
      role: "support",
    })).resolves.toEqual({ id: targetId, role: "support" });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into admin_memberships"),
      [targetId, "support", actorId],
    );
    expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.role_updated",
      metadata: { previousRole: null, nextRole: "support" },
    }));
  });
});
