"use client";

import {
  Bell,
  Check,
  CircleAlert,
  Inbox,
  Leaf,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HabitCreateDialog } from "./habit-create-dialog";
import { apiRequest } from "../lib/api";
import type {
  Habit,
  HabitLog,
  HabitTemplate,
  NotificationDelivery,
  Profile,
  TodayHabit,
} from "../lib/api/types";
import {
  habitProgress,
  habitProgressLabel,
  localDateString,
  profileDisplayName,
} from "../lib/dashboard";

type DashboardData = {
  profile: Profile;
  habits: TodayHabit[];
  allHabits: Habit[];
  templates: HabitTemplate[];
  notifications: NotificationDelivery[];
};

export function UserDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const localDate = useMemo(() => localDateString(), []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profile, habits, allHabits, templates, notifications] = await Promise.all([
        apiRequest<Profile>("/profile"),
        apiRequest<TodayHabit[]>(`/today?date=${localDate}`),
        apiRequest<Habit[]>("/habits"),
        apiRequest<HabitTemplate[]>("/habit-templates"),
        apiRequest<NotificationDelivery[]>("/notifications"),
      ]);
      setData({ profile, habits, allHabits, templates, notifications });
    } catch (requestError) {
      setData(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your private space could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [localDate]);

  async function refreshHabits() {
    const [habits, allHabits, templates] = await Promise.all([
      apiRequest<TodayHabit[]>(`/today?date=${localDate}`),
      apiRequest<Habit[]>("/habits"),
      apiRequest<HabitTemplate[]>("/habit-templates"),
    ]);
    setData((current) => current
      ? { ...current, habits, allHabits, templates }
      : current);
  }

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function toggleHabit(habit: TodayHabit) {
    if (!data) return;
    const previous = habit.todayLog ?? null;
    const nextStatus = previous?.status === "done" ? "skipped" : "done";
    const optimistic: HabitLog = {
      id: previous?.id ?? `optimistic-${habit.id}`,
      habit_id: habit.id,
      user_id: data.profile.id,
      local_date: localDate,
      status: nextStatus,
      value: nextStatus === "done" ? habit.target ?? null : null,
      note: null,
    };

    setData((current) => current ? {
      ...current,
      habits: current.habits.map((item) =>
        item.id === habit.id ? { ...item, todayLog: optimistic } : item,
      ),
    } : current);
    try {
      const saved = await apiRequest<HabitLog>(`/habits/${habit.id}/logs/${localDate}`, {
        method: "PUT",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          status: nextStatus,
          value: nextStatus === "done" ? habit.target ?? null : null,
          note: null,
          prayerStatus: null,
        }),
      });
      setData((current) => current ? {
        ...current,
        habits: current.habits.map((item) =>
          item.id === habit.id ? { ...item, todayLog: saved } : item,
        ),
      } : current);
      toast.success(nextStatus === "done" ? "Check-in saved." : "Marked as intentionally skipped.");
    } catch (requestError) {
      setData((current) => current ? {
        ...current,
        habits: current.habits.map((item) =>
          item.id === habit.id ? { ...item, todayLog: previous } : item,
        ),
      } : current);
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "The check-in could not be saved.",
      );
    }
  }

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/");
  }

  if (loading) return <DashboardLoading />;

  if (error || !data) {
    return (
      <main className="honest-state">
        <span><CircleAlert size={28} /></span>
        <p>YOUR PRIVATE SPACE</p>
        <h1>We couldn’t load your account.</h1>
        <small>{error || "The account service is temporarily unavailable."}</small>
        <button onClick={() => void loadDashboard()}><RefreshCw size={17} /> Try again</button>
      </main>
    );
  }

  const completed = data.habits.filter((habit) => habit.todayLog?.status === "done").length;
  const percentage = data.habits.length
    ? Math.round((completed / data.habits.length) * 100)
    : 0;
  const displayName = profileDisplayName(data.profile);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="honest-dashboard">
      <header className="honest-topbar">
        <a href="/" className="bloom-brand">
          <span><Sprout size={21} /></span><strong>Bloom</strong>
        </a>
        <div className="honest-account">
          <span><Bell size={18} /> {data.notifications.length}</span>
          <div><strong>{displayName}</strong><small>{data.profile.email}</small></div>
          <button onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}
            Sign out
          </button>
        </div>
      </header>

      <div className="honest-layout">
        <aside className="honest-sidebar">
          <p>YOUR PRIVATE SPACE</p>
          <nav aria-label="Account sections">
            <a href="#today" className="active"><Leaf size={18} /> Today</a>
            <a href="#inbox"><Inbox size={18} /> Inbox <span>{data.notifications.length}</span></a>
          </nav>
          <div><ShieldCheck size={22} /><strong>Private by design</strong><p>Only your authenticated account can see this page.</p></div>
        </aside>

        <div className="honest-content">
          <section className="honest-welcome" id="today">
            <div>
              <p>{dateLabel.toUpperCase()}</p>
              <h1>Keep the promises that matter, {displayName}.</h1>
              <span>Today’s record is built only from your real check-ins.</span>
            </div>
          </section>

          <section className="honest-summary">
            <div>
              <p>TODAY’S RECORD</p>
              <h2>{data.habits.length ? `${completed} of ${data.habits.length} complete` : "A clear place to begin"}</h2>
              <span>{data.habits.length ? "Every honest mark strengthens the system." : "No habits are scheduled for today."}</span>
            </div>
            <div
              className="honest-ring"
              style={{ "--honest-progress": `${percentage * 3.6}deg` } as React.CSSProperties}
              aria-label={`${percentage}% complete`}
            >
              <span><strong>{percentage}%</strong><small>complete</small></span>
            </div>
          </section>

          <section className="honest-habits" aria-labelledby="today-habits-title">
            <div className="honest-section-title">
              <div><p>YOUR PRACTICE</p><h2 id="today-habits-title">Today’s habits</h2></div>
              <div className="honest-section-actions">
                <span>{data.habits.length} active today</span>
                <button type="button" onClick={() => setShowAddHabit(true)}>
                  <Plus size={16} /> Add habit
                </button>
              </div>
            </div>

            {data.habits.length === 0 ? (
              <div className="honest-empty">
                <span><Sprout size={25} /></span>
                <h3>No habits yet.</h3>
                <p>Your account is ready. Add a practice when you know what promise you want to keep.</p>
                <button type="button" onClick={() => setShowAddHabit(true)}>
                  <Plus size={16} /> Add your first habit
                </button>
              </div>
            ) : (
              <div className="honest-habit-list">
                {data.habits.map((habit) => {
                  const progress = habitProgress(habit);
                  const isDone = habit.todayLog?.status === "done";
                  return (
                    <article className={isDone ? "is-complete" : ""} key={habit.id}>
                      <span className="honest-habit-icon">{habit.icon}</span>
                      <div className="honest-habit-copy">
                        <p>{habit.category.toUpperCase()}</p>
                        <h3>{habit.name}</h3>
                        <span>{habitProgressLabel(habit)}</span>
                        <div><i style={{ width: `${progress}%` }} /></div>
                      </div>
                      <button
                        className={isDone ? "is-checked" : ""}
                        onClick={() => void toggleHabit(habit)}
                        aria-label={isDone ? `Mark ${habit.name} as skipped` : `Complete ${habit.name}`}
                      >
                        {isDone && <Check size={21} />}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="honest-inbox" id="inbox" aria-labelledby="inbox-title">
            <div className="honest-section-title">
              <div><p>REMINDERS</p><h2 id="inbox-title">Your inbox</h2></div>
              <span>{data.notifications.length} items</span>
            </div>
            {data.notifications.length === 0 ? (
              <p className="honest-inbox-empty">Nothing needs your attention right now.</p>
            ) : (
              <div className="honest-notifications">
                {data.notifications.slice(0, 3).map((notification) => (
                  <article key={notification.id}>
                    <Bell size={18} />
                    <div><strong>{notification.title}</strong><p>{notification.body}</p></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <HabitCreateDialog
        open={showAddHabit}
        onOpenChange={setShowAddHabit}
        templates={data.templates}
        activeTemplateIds={new Set(
          data.allHabits
            .map((habit) => habit.template_id)
            .filter((templateId): templateId is string => Boolean(templateId)),
        )}
        onCreated={async () => {
          try {
            await refreshHabits();
          } catch {
            toast.error("The habit was saved, but today’s list could not refresh.");
          }
          toast.success("Your habit is ready to grow.");
        }}
      />
    </main>
  );
}

function DashboardLoading() {
  return (
    <main className="honest-dashboard honest-loading" aria-label="Loading your private space">
      <header className="honest-topbar"><div className="loading-block loading-brand" /><div className="loading-block loading-account" /></header>
      <div className="honest-loading__content">
        <div className="loading-block loading-title" />
        <div className="loading-block loading-summary" />
        <div className="loading-block loading-row" />
        <div className="loading-block loading-row" />
        <span className="sr-only">Loading your habits and reminders.</span>
      </div>
    </main>
  );
}
