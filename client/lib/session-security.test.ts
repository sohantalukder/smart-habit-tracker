import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./request-origin";
import {
  expiredSessionCookie,
  sessionCookie,
} from "./session-cookie";

describe("web session security", () => {
  it("uses a production-only Secure HttpOnly SameSite cookie", () => {
    const cookie = sessionCookie("2030-01-01T00:00:00.000Z", true);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(expiredSessionCookie(true).expires.getTime()).toBe(0);
  });

  it("rejects cross-origin browser mutations", () => {
    expect(isSameOrigin(new Request("https://bloom.example/api", {
      headers: { origin: "https://bloom.example" },
    }))).toBe(true);
    expect(isSameOrigin(new Request("https://bloom.example/api", {
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
  });
});
