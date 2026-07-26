import { build } from "esbuild";
import { loadEnvFile } from "node:process";

const nodeEnvironment = process.env.NODE_ENV ?? "development";
const environmentFiles = [
  `.env.${nodeEnvironment}.local`,
  ...(nodeEnvironment === "test" ? [] : [".env.local"]),
  `.env.${nodeEnvironment}`,
  ".env",
];

for (const environmentFile of environmentFiles) {
  try {
    loadEnvFile(environmentFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const publicVariables = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

await build({
  entryPoints: ["service-workers/firebase-messaging-sw.js"],
  outfile: "public/firebase-messaging-sw.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  minify: process.env.NODE_ENV === "production",
  define: Object.fromEntries(
    publicVariables.map((name) => [
      `process.env.${name}`,
      JSON.stringify(process.env[name] ?? ""),
    ]),
  ),
});
