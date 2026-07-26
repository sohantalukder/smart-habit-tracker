import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { purgeDeletedAccounts } from "../src/accounts/purge-deleted-accounts";
import { AuthService } from "../src/auth/auth.service";
import { hashPassword } from "../src/auth/password";
import { profileUpdateSchema } from "../src/contracts";
import type { DatabaseService } from "../src/platform/database.service";
import { AvatarStorageService } from "../src/profile/avatar-storage.service";
import { ProfileController } from "../src/profile/profile.controller";
import type { AuthenticatedRequest } from "../src/auth/auth.guard";
import type { AuditService } from "../src/platform/audit.service";
import type { VerificationEmailService } from "../src/auth/verification-email.service";

const userId = "4245f96d-1a2b-4f3c-9d5e-112233445566";
const request = {
  user: { id: userId, email: "user@example.com", name: "User" },
  sessionId: "session-1",
  correlationId: "correlation-1",
} as AuthenticatedRequest;

describe("profile account contracts", () => {
  it("accepts IANA timezones and rejects invented zones", () => {
    expect(profileUpdateSchema.safeParse({
      name: "Md. Sohan Talukder",
      timezone: "Asia/Dhaka",
      units: "metric",
    }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({
      name: "Md. Sohan Talukder",
      timezone: "Dhaka/Local",
      units: "metric",
    }).success).toBe(false);
  });

  it("never returns the private avatar object path from the profile endpoint", async () => {
    const row = {
      id: userId,
      email: "user@example.com",
      name: "User",
      has_avatar: true,
      avatar_updated_at: new Date(),
    };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [row] }),
    } as unknown as DatabaseService;
    const controller = new ProfileController(
      database,
      {} as AvatarStorageService,
      {} as AuditService,
    );

    await expect(controller.profile(request)).resolves.toEqual(row);
    expect(database.query).toHaveBeenCalledWith(
      expect.not.stringContaining("select p.*"),
      [userId],
    );
    expect(row).not.toHaveProperty("avatar_object_path");
  });

  it("rejects invalid image bytes before contacting Firebase Storage", async () => {
    const storage = new AvatarStorageService();
    await expect(storage.save(userId, Buffer.from("not-an-image")))
      .rejects.toMatchObject({ status: 400 });
  });

  it("maps Firebase failures to a safe retryable API error", async () => {
    const storage = new AvatarStorageService();
    Object.assign(storage, {
      storage: {
        bucket: () => ({
          file: () => ({
            save: vi.fn().mockRejectedValue(Object.assign(new Error("bucket missing"), {
              code: 404,
            })),
          }),
        }),
      },
      bucketName: "missing.firebasestorage.app",
    });
    const image = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#1b5e4b",
      },
    }).png().toBuffer();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(storage.save(userId, image)).rejects.toMatchObject({
      status: 503,
    });
    consoleError.mockRestore();
  });
});

describe("sensitive account lifecycle", () => {
  it("returns a recoverable deletion response for correct credentials", async () => {
    const passwordHash = await hashPassword("valid-password");
    const purgeAt = new Date(Date.now() + 60_000);
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: userId,
          email: "user@example.com",
          password_hash: passwordHash,
          email_verified_at: new Date(),
          name: "User",
          suspended_at: null,
          deleted_at: new Date(),
          deletion_purge_at: purgeAt,
        }],
      }),
    } as unknown as DatabaseService;
    const service = new AuthService(
      database,
      {} as VerificationEmailService,
    );

    await expect(service.login({
      email: "user@example.com",
      password: "valid-password",
    })).rejects.toMatchObject({ status: 403 });
  });

  it("restores a soft-deleted account and creates a fresh session", async () => {
    const passwordHash = await hashPassword("valid-password");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("update profiles")) return { rows: [{ id: userId }] };
        if (sql.includes("select u.id, u.email, p.name")) {
          return { rows: [{ id: userId, email: "user@example.com", name: "User" }] };
        }
        return { rows: [] };
      }),
    };
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: userId,
          email: "user@example.com",
          password_hash: passwordHash,
          email_verified_at: new Date(),
          name: "User",
          suspended_at: null,
          deleted_at: new Date(),
          deletion_purge_at: new Date(Date.now() + 60_000),
        }],
      }),
      transaction: vi.fn(async (work) => work(client)),
    } as unknown as DatabaseService;
    const email = {
      sendSecurityNotice: vi.fn(),
    } as unknown as VerificationEmailService;
    const service = new AuthService(database, email);

    const session = await service.restoreAccount({
      email: "user@example.com",
      password: "valid-password",
    });

    expect(session.user.id).toBe(userId);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("deletion_purge_at = null"),
      [userId],
    );
    expect(email.sendSecurityNotice).toHaveBeenCalledOnce();
  });

  it("removes storage before cascading a due account from the database", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          avatar_object_path: `profile-avatars/${userId}/avatar.webp`,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: userId }] })
      .mockResolvedValueOnce({ rows: [] });
    const database = { query } as never;
    const bucket = { file: vi.fn(() => ({ delete: remove })) };

    await expect(purgeDeletedAccounts(database, bucket)).resolves.toEqual({ purged: 1 });
    expect(remove).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(query.mock.calls[2]?.[0]).toContain("delete from users");
    expect(query.mock.calls[3]?.[0]).toContain("account.purged");
  });

  it("does not delete the database record when avatar removal fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        id: userId,
        avatar_object_path: `profile-avatars/${userId}/avatar.webp`,
      }],
    });
    const bucket = {
      file: vi.fn(() => ({
        delete: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      })),
    };

    await expect(purgeDeletedAccounts({ query } as never, bucket))
      .rejects.toThrow("1 account purge operation");
    expect(query).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
