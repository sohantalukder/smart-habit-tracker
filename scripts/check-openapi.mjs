import { readFile } from "node:fs/promises";

const path = new URL("../src/openapi/openapi.json", import.meta.url);
const document = JSON.parse(await readFile(path, "utf8"));

if (document.openapi !== "3.1.0") {
  throw new Error("OpenAPI document must use version 3.1.0.");
}
if (
  !document.paths?.["/admin/session"] ||
  !document.paths?.["/health/ready"] ||
  !document.paths?.["/auth/signup"] ||
  !document.paths?.["/auth/login"] ||
  !document.paths?.["/auth/verify-email"]
) {
  throw new Error("OpenAPI document is missing required public interfaces.");
}
if (!document.components?.securitySchemes?.bearerAuth) {
  throw new Error("OpenAPI document must define bearer authentication.");
}
if (document.components.securitySchemes.bearerAuth.bearerFormat !== "OpaqueSessionToken") {
  throw new Error("OpenAPI bearer auth must use first-party opaque sessions.");
}

console.log(`OpenAPI ${document.info.version}: ${Object.keys(document.paths).length} paths`);
