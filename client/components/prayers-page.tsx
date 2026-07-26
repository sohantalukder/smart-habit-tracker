"use client";

import { localDateString } from "@/lib/dashboard";
import { PrayerPanel } from "./prayer-panel";

export function PrayersPage() {
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
