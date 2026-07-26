"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import { appQueries } from "@/lib/queries";
import { SettingsPanel } from "./settings-panel";
import { useDashboardShell } from "./dashboard-shell";

export function SettingsPage() {
  const { profile } = useDashboardShell();
  const habitsQuery = useQuery(appQueries.habits());
  const habits = habitsQuery.data ?? [];
  const loading = habitsQuery.isPending;
  const error = habitsQuery.error instanceof Error && !habitsQuery.data
    ? habitsQuery.error.message
    : habitsQuery.error && !habitsQuery.data
      ? "Reminder settings could not be loaded."
      : "";

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
          <button type="button" onClick={() => void habitsQuery.refetch()}><RotateCcw /> Try again</button>
        </section>
      ) : (
        <SettingsPanel
          profile={profile}
          habits={habits}
        />
      )}
    </div>
  );
}
