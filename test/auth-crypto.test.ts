import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { createSecretToken, hashSecretToken } from "../src/auth/token";

describe("first-party auth cryptography", () => {
  it("stores salted scrypt hashes and verifies only the original password", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).toMatch(/^scrypt\$/);
    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it("creates random opaque tokens and stores deterministic hashes", () => {
    const first = createSecretToken();
    const second = createSecretToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(hashSecretToken(first)).toEqual(hashSecretToken(first));
    expect(hashSecretToken(first)).not.toEqual(hashSecretToken(second));
  });
});
