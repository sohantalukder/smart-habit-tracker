import { createHash, randomBytes } from "node:crypto";

export function createSecretToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSecretToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
