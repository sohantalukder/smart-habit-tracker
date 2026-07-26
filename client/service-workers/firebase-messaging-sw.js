import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (Object.values(config).every(Boolean)) {
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, (payload) => {
    const data = payload.data ?? {};
    void self.registration.showNotification(
      data.title || "A gentle reminder",
      {
        body: data.body || "A small step can make today feel complete.",
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url: data.url || "/" },
      },
    );
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) => "focus" in client);
        if (existing) {
          void existing.navigate(url);
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
