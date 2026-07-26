import { beforeEach, describe, expect, it, vi } from "vitest";

const messaging = {};
let registeredHandler: ((installationId: string) => void) | null = null;

const apiRequest = vi.fn().mockResolvedValue({ registered: true });
const onRegistered = vi.fn((_messaging, handler) => {
  registeredHandler = handler;
  return () => {
    if (registeredHandler === handler) registeredHandler = null;
  };
});
const register = vi.fn(async () => {
  if (!registeredHandler) throw new Error("No registration handler.");
  registeredHandler("firebase-installation-id");
});

vi.mock("./api", () => ({ apiRequest }));
vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => messaging,
  isSupported: async () => true,
  onMessage: vi.fn(),
  onRegistered,
  onUnregistered: vi.fn(),
  register,
  unregister: vi.fn(),
}));

describe("Firebase push registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = null;
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "example.firebaseapp.com";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "example";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "example.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "app-id";
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    vi.stubGlobal("window", {
      Notification,
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: vi.fn().mockResolvedValue({ scope: "/" }),
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("keeps one registration handler and uploads every refreshed installation", async () => {
    const {
      enablePushNotifications,
      syncPushRegistration,
    } = await import("./firebase-messaging");

    await enablePushNotifications();
    await syncPushRegistration();

    expect(onRegistered).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/push/installations", {
      method: "POST",
      body: JSON.stringify({
        installationId: "firebase-installation-id",
        platform: "web",
      }),
    });
  });
});
