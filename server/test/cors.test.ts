import { describe, expect, it } from "vitest";
import { createOriginPolicy } from "../src/platform/cors";

describe("CORS origin policy", () => {
  it("allows exact production origins and non-browser clients", () => {
    const allows = createOriginPolicy({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://bloom.vercel.app, https://app.example.com/",
    });
    expect(allows(undefined)).toBe(true);
    expect(allows("https://bloom.vercel.app")).toBe(true);
    expect(allows("https://app.example.com/")).toBe(true);
    expect(allows("https://attacker.example")).toBe(false);
  });

  it("allows only controlled Vercel previews outside production", () => {
    const allows = createOriginPolicy({
      NODE_ENV: "staging",
      ALLOWED_ORIGINS: "http://localhost:3000",
      VERCEL_PROJECT_SLUG: "smart-habit-web",
      VERCEL_TEAM_SLUG: "bloom-team",
    });
    expect(
      allows("https://smart-habit-web-git-main-bloom-team.vercel.app"),
    ).toBe(true);
    expect(allows("https://other-git-main-bloom-team.vercel.app")).toBe(false);
    expect(allows("https://smart-habit-web-git-main-evil.vercel.app")).toBe(false);
  });
});
