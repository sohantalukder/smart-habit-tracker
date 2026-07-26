import { describe, expect, it } from "vitest";
import { AuthRateLimitService } from "../src/auth/auth-rate-limit.service";

describe("AuthRateLimitService", () => {
  it("rejects attempts above the configured local limit", async () => {
    const service = new AuthRateLimitService();
    await service.consume("test", "user@example.com", 2, 60);
    await service.consume("test", "user@example.com", 2, 60);
    await expect(
      service.consume("test", "user@example.com", 2, 60),
    ).rejects.toMatchObject({ status: 429 });
    await service.onModuleDestroy();
  });
});
