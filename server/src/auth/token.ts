import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export function createSecretToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSecretToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function createOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(
  requestId: string,
  purpose: "email_verification" | "email_change",
  code: string,
) {
  return createHmac("sha256", otpSecret())
    .update(`${requestId}:${purpose}:${code}`)
    .digest();
}

export function otpMatches(expected: Buffer, actual: Buffer) {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function otpSecret() {
  const configured = process.env.AUTH_OTP_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_OTP_SECRET is required in production.");
  }
  return "bloom-development-only-otp-secret";
}
