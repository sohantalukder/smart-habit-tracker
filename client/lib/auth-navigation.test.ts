import { describe, expect, it } from "vitest";
import { authMode, safeReturnTo } from "./auth-navigation";

describe("auth navigation", () => {
  it("keeps same-origin return paths", () => {
    expect(safeReturnTo("/admin?tab=health")).toBe("/admin?tab=health");
  });

  it("rejects missing and protocol-relative destinations", () => {
    expect(safeReturnTo()).toBe("/");
    expect(safeReturnTo("//example.com/steal-session")).toBe("/");
    expect(safeReturnTo("https://example.com")).toBe("/");
  });

  it("only accepts signup as an alternate mode", () => {
    expect(authMode("signup")).toBe("signup");
    expect(authMode("signin")).toBe("signin");
    expect(authMode("other")).toBe("signin");
  });
});
