import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { hashPassword } from "../src/auth/password";
import type { DatabaseService } from "../src/platform/database.service";
import type { VerificationEmailService } from "../src/auth/verification-email.service";

describe("AuthService", () => {
  it("blocks a correct password until the account email is verified", async () => {
    const passwordHash = await hashPassword("valid-password");
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "4245f96d-1a2b-4f3c-9d5e-112233445566",
          email: "user@example.com",
          password_hash: passwordHash,
          email_verified_at: null,
          name: "User",
          suspended_at: null,
          deleted_at: null,
        }],
      }),
    } as unknown as DatabaseService;
    const service = new AuthService(
      database,
      { send: vi.fn() } as unknown as VerificationEmailService,
    );

    await expect(service.login({
      email: "USER@example.com",
      password: "valid-password",
    })).rejects.toMatchObject({ status: 403 });
  });

  it("consumes a valid verification token and creates an opaque session", async () => {
    const userId = "4245f96d-1a2b-4f3c-9d5e-112233445566";
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from email_verification_tokens")) {
          return {
            rows: [{
              id: "5245f96d-1a2b-4f3c-9d5e-112233445566",
              user_id: userId,
              expires_at: new Date(Date.now() + 60_000),
              consumed_at: null,
            }],
          };
        }
        if (sql.includes("select u.id, u.email, p.name")) {
          return {
            rows: [{ id: userId, email: "user@example.com", name: "User" }],
          };
        }
        return { rows: [] };
      }),
    };
    const database = {
      transaction: vi.fn(async (work) => work(client)),
    } as unknown as DatabaseService;
    const service = new AuthService(
      database,
      { send: vi.fn() } as unknown as VerificationEmailService,
    );

    const session = await service.verifyEmail("a".repeat(43));

    expect(session.user.email).toBe("user@example.com");
    expect(session.accessToken.length).toBeGreaterThanOrEqual(32);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into user_sessions"),
      expect.any(Array),
    );
  });

  it("rejects unknown or expired session tokens", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as DatabaseService;
    const service = new AuthService(
      database,
      { send: vi.fn() } as unknown as VerificationEmailService,
    );

    await expect(service.authenticate("missing-session")).rejects.toMatchObject({
      status: 401,
    });
  });
});
