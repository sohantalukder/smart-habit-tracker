"use client";

import { getApps, initializeApp } from "firebase/app";
import {
  getMessaging,
  isSupported,
  onMessage,
  onRegistered,
  onUnregistered,
  register,
  unregister,
  type MessagePayload,
  type Messaging,
} from "firebase/messaging";
import { apiRequest } from "./api";

const INSTALLATION_STORAGE_KEY = "bloom_firebase_installation_id";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const registrationOptions = {
  ...(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    ? { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY }
    : {}),
};

let messagingPromise: Promise<Messaging | null> | null = null;
let listenersAttached = false;
let registrationUpload: Promise<void> | null = null;
let registrationChain = Promise.resolve();

export type PushRegistrationState =
  | "enabled"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unconfigured";

export function currentPushState(): PushRegistrationState {
  if (!isConfigured()) return "unconfigured";
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "enabled";
  return Notification.permission === "denied" ? "denied" : "prompt";
}

export async function enablePushNotifications(
  foreground?: (payload: MessagePayload) => void,
) {
  if (!isConfigured()) return "unconfigured" as const;
  if (!await isSupported()) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied" as const;
  const messaging = await messagingInstance();
  if (!messaging) return "unconfigured" as const;
  attachRegistrationListeners(messaging);
  if (foreground) onMessage(messaging, foreground);
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
    { scope: "/" },
  );
  await registerAndUpload(messaging, registration);
  return "enabled" as const;
}

export async function syncPushRegistration(
  foreground?: (payload: MessagePayload) => void,
) {
  if (currentPushState() !== "enabled" || !await isSupported()) {
    return currentPushState();
  }
  const messaging = await messagingInstance();
  if (!messaging) return "unconfigured" as const;
  attachRegistrationListeners(messaging);
  if (foreground) onMessage(messaging, foreground);
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
    { scope: "/" },
  );
  await registerAndUpload(messaging, registration);
  return "enabled" as const;
}

export async function unregisterPushNotifications() {
  const installationId = localStorage.getItem(INSTALLATION_STORAGE_KEY);
  if (installationId) {
    await apiRequest(
      `/push/installations/${encodeURIComponent(installationId)}`,
      { method: "DELETE" },
    ).catch(() => null);
  }
  const messaging = await messagingInstance();
  if (messaging) await unregister(messaging).catch(() => null);
  localStorage.removeItem(INSTALLATION_STORAGE_KEY);
}

async function messagingInstance() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!isConfigured() || !await isSupported()) return null;
      const app = getApps()[0] ?? initializeApp(config);
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

function attachRegistrationListeners(messaging: Messaging) {
  if (listenersAttached) return;
  listenersAttached = true;
  onRegistered(messaging, (installationId) => {
    registrationUpload = uploadInstallation(installationId);
    void registrationUpload.catch(() => null);
  });
  onUnregistered(messaging, (installationId) => {
    localStorage.removeItem(INSTALLATION_STORAGE_KEY);
    void apiRequest(
      `/push/installations/${encodeURIComponent(installationId)}`,
      { method: "DELETE" },
    ).catch(() => null);
  });
}

function registerAndUpload(
  messaging: Messaging,
  serviceWorkerRegistration: ServiceWorkerRegistration,
) {
  registrationChain = registrationChain.catch(() => undefined).then(async () => {
    registrationUpload = null;
    await register(messaging, {
      ...registrationOptions,
      serviceWorkerRegistration,
    });
    const uploaded = registrationUpload;
    if (!uploaded) {
      throw new Error("Firebase registration completed without an installation ID.");
    }
    await uploaded;
  });
  return registrationChain;
}

async function uploadInstallation(installationId: string) {
  localStorage.setItem(INSTALLATION_STORAGE_KEY, installationId);
  await apiRequest("/push/installations", {
    method: "POST",
    body: JSON.stringify({ installationId, platform: "web" }),
  });
}

function isConfigured() {
  return Object.values(config).every(Boolean);
}
