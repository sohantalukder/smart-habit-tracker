import { readFile } from "node:fs/promises";

const path = new URL("../src/openapi/openapi.json", import.meta.url);
const document = JSON.parse(await readFile(path, "utf8"));

if (document.openapi !== "3.1.0") {
  throw new Error("OpenAPI document must use version 3.1.0.");
}
const requiredPaths = [
  "/admin/session",
  "/health/ready",
  "/auth/signup",
  "/auth/login",
  "/auth/verify-email",
  "/habit-recommendations",
  "/onboarding",
  "/preferences",
  "/prayer-times",
  "/prayers/{prayer}/logs/{localDate}",
  "/habits/{habitId}/reminder",
  "/journal/{localDate}",
  "/tracking",
  "/push/installations",
];
if (requiredPaths.some((path) => !document.paths?.[path])) {
  throw new Error("OpenAPI document is missing required public interfaces.");
}
if (!document.components?.securitySchemes?.bearerAuth) {
  throw new Error("OpenAPI document must define bearer authentication.");
}
if (document.components.securitySchemes.bearerAuth.bearerFormat !== "OpaqueSessionToken") {
  throw new Error("OpenAPI bearer auth must use first-party opaque sessions.");
}

console.log(`OpenAPI ${document.info.version}: ${Object.keys(document.paths).length} paths`);
