"use client";

import { useEffect } from "react";
import { syncPushRegistration } from "@/lib/firebase-messaging";
import { toast } from "sonner";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    void syncPushRegistration((payload) => {
      toast(payload.data?.title ?? "A gentle reminder", {
        description: payload.data?.body,
      });
      window.dispatchEvent(new CustomEvent("bloom:notification"));
    });
  }, []);
  return null;
}
