import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

import { VerificationEmailService } from "../src/auth/verification-email.service";

describe("VerificationEmailService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mocks.send.mockReset();
  });

  it("prints the verification token and URL without sending email in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const service = new VerificationEmailService();

    await service.send("user@example.com", "verification-token");

    expect(mocks.send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: "auth.verification_link",
      email: "user@example.com",
      token: "verification-token",
      url: "http://localhost:3000/auth/verify?token=verification-token",
    }));
  });

  it("requires the email provider configuration in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    const service = new VerificationEmailService();

    await expect(
      service.send("user@example.com", "verification-token"),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "EMAIL_UNAVAILABLE" },
    });
  });

  it("returns an email service error when production delivery fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    mocks.send.mockResolvedValue({ error: { message: "Delivery failed" } });
    const service = new VerificationEmailService();

    await expect(
      service.send("user@example.com", "verification-token"),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "EMAIL_UNAVAILABLE" },
    });
  });
});
