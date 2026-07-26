"use client";

import { redirect } from "next/navigation";
import { localDateString } from "@/lib/dashboard";
import { useDashboardShell } from "./dashboard-shell";
import { PrayerPanel } from "./prayer-panel";

export function PrayersPage() {
  const { profile } = useDashboardShell();
  if (profile.religion_preference !== "muslim") redirect("/dashboard");

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p>PRAYER PRACTICE</p>
          <h1>Prayers</h1>
          <span>Today’s local prayer times and check-ins, in a calm space of their own.</span>
        </div>
      </header>
      <PrayerPanel localDate={localDateString()} />
    </div>
  );
}
