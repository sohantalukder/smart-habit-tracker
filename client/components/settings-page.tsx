"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { HabitWithReminder } from "@/lib/api/types";
import { SettingsPanel } from "./settings-panel";
import { useDashboardShell } from "./dashboard-shell";

export function SettingsPage() {
  const { profile, refreshProfile } = useDashboardShell();
  const [habits, setHabits] = useState<HabitWithReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHabits = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHabits(await apiRequest<HabitWithReminder[]>("/habits"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reminder settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p>YOUR ACCOUNT</p>
          <h1>Settings</h1>
          <span>Manage goals, notifications, prayer preferences, and reminder times.</span>
        </div>
      </header>
      {loading ? (
        <div className="page-loading"><span /><span /><span /></div>
      ) : error ? (
        <section className="page-error" role="alert">
          <CircleAlert />
          <div><strong>We couldn’t load your settings.</strong><span>{error}</span></div>
          <button type="button" onClick={() => void loadHabits()}><RotateCcw /> Try again</button>
        </section>
      ) : (
        <SettingsPanel
          profile={profile}
          habits={habits}
          onSaved={async () => {
            await Promise.all([refreshProfile(), loadHabits()]);
          }}
        />
      )}
    </div>
  );
}
