import { readFile } from "node:fs/promises";

const path = new URL("../src/openapi/openapi.json", import.meta.url);
const document = JSON.parse(await readFile(path, "utf8"));

if (document.openapi !== "3.1.0") {
  throw new Error("OpenAPI document must use version 3.1.0.");
}
const requiredPaths = [
  "/admin/session",
  "/admin/users/{userId}/details",
  "/admin/users/{userId}/profile",
  "/admin/users/{userId}/role",
  "/admin/users/{userId}/prayer-settings",
  "/admin/users/{userId}/password",
  "/admin/users/{userId}/habits/{habitId}",
  "/admin/users/{userId}/habits/{habitId}/check-ins/{localDate}",
  "/admin/users/{userId}/journals/{localDate}",
  "/admin/users/{userId}/prayers/{prayer}/logs/{localDate}",
  "/admin/users/{userId}/prayer-reminders/{prayer}",
  "/admin/users/{userId}/sessions/revoke",
  "/admin/users/{userId}/verification-requests/invalidate",
  "/admin/users/{userId}/installations/{installationId}",
  "/admin/notifications/{deliveryId}/cancel",
  "/health/ready",
  "/auth/signup",
  "/auth/login",
  "/auth/verify-email",
  "/auth/restore-account",
  "/auth/change-password",
  "/auth/request-email-change",
  "/auth/verify-email-change",
  "/auth/sign-out-others",
  "/auth/delete-account",
  "/profile",
  "/profile/avatar",
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
