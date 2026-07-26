export type AuthMode = "signin" | "signup";

export function safeReturnTo(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function authMode(value?: string): AuthMode {
  return value === "signup" ? "signup" : "signin";
}
