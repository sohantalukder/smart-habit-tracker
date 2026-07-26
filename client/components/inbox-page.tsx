"use client";

import { Bell, Inbox, RotateCcw } from "lucide-react";
import { useDashboardShell } from "./dashboard-shell";

export function InboxPage() {
  const { notifications, refreshNotifications } = useDashboardShell();

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p>REMINDERS</p>
          <h1>Inbox</h1>
          <span>Habit reminders and account messages, kept separate from your daily journal.</span>
        </div>
      </header>

      <section className="inbox-page-list" aria-label="Notifications">
        <div className="section-heading-compact">
          <div><p>RECENT</p><h2>{notifications.length} {notifications.length === 1 ? "item" : "items"}</h2></div>
          <button type="button" onClick={() => void refreshNotifications()}><RotateCcw /> Refresh</button>
        </div>
        {notifications.length === 0 ? (
          <div className="journal-empty">
            <Inbox />
            <h3>You’re all caught up.</h3>
            <p>New reminders and private account messages will appear here.</p>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => (
              <article key={notification.id}>
                <span><Bell /></span>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <time>{formatTime(notification.scheduled_at)}</time>
                </div>
                <small>{notification.state}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
