"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";
import type { DailyJournal, HabitLog, TodayHabit } from "@/lib/api/types";
import { localDateString } from "@/lib/dashboard";
import { useDashboardShell } from "./dashboard-shell";

export function UserDashboard() {
  const { profile } = useDashboardShell();
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [habits, setHabits] = useState<TodayHabit[]>([]);
  const [journal, setJournal] = useState<DailyJournal | null>(null);
  const [draft, setDraft] = useState({ winNote: "", reflectionNote: "" });
  const [loading, setLoading] = useState(true);
  const [savingJournal, setSavingJournal] = useState(false);
  const [pendingHabit, setPendingHabit] = useState("");
  const [error, setError] = useState("");
  const today = localDateString();

  const loadDay = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextHabits, nextJournal] = await Promise.all([
        apiRequest<TodayHabit[]>(`/today?date=${selectedDate}`),
        apiRequest<DailyJournal>(`/journal/${selectedDate}`),
      ]);
      setHabits(nextHabits);
      setJournal(nextJournal);
      setDraft({
        winNote: nextJournal.win_note ?? "",
        reflectionNote: nextJournal.reflection_note ?? "",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This day could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  async function toggleHabit(habit: TodayHabit) {
    if (pendingHabit) return;
    const previous = habit.todayLog ?? null;
    const isDone = previous?.status === "done";
    setPendingHabit(habit.id);

    if (isDone) {
      setHabits((current) => current.map((item) =>
        item.id === habit.id ? { ...item, todayLog: null } : item
      ));
      try {
        await apiRequest<{ deleted: boolean }>(
          `/habits/${habit.id}/logs/${selectedDate}`,
          { method: "DELETE" },
        );
        toast.success("Check-in removed.");
      } catch (reason) {
        setHabits((current) => current.map((item) =>
          item.id === habit.id ? { ...item, todayLog: previous } : item
        ));
        toast.error(reason instanceof Error ? reason.message : "The check-in could not be removed.");
      } finally {
        setPendingHabit("");
      }
      return;
    }

    const optimistic: HabitLog = {
      id: `optimistic-${habit.id}`,
      habit_id: habit.id,
      user_id: profile.id,
      local_date: selectedDate,
      status: "done",
      value: habit.target ?? null,
      note: null,
    };
    setHabits((current) => current.map((item) =>
      item.id === habit.id ? { ...item, todayLog: optimistic } : item
    ));
    try {
      const saved = await apiRequest<HabitLog>(`/habits/${habit.id}/logs/${selectedDate}`, {
        method: "PUT",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          status: "done",
          value: habit.target ?? null,
          note: null,
          prayerStatus: null,
        }),
      });
      setHabits((current) => current.map((item) =>
        item.id === habit.id ? { ...item, todayLog: saved } : item
      ));
      toast.success("Promise kept. Check-in saved.");
    } catch (reason) {
      setHabits((current) => current.map((item) =>
        item.id === habit.id ? { ...item, todayLog: previous } : item
      ));
      toast.error(reason instanceof Error ? reason.message : "The check-in could not be saved.");
    } finally {
      setPendingHabit("");
    }
  }

  async function saveJournal() {
    setSavingJournal(true);
    try {
      const saved = await apiRequest<DailyJournal>(`/journal/${selectedDate}`, {
        method: "PUT",
        body: JSON.stringify({
          winNote: draft.winNote || null,
          reflectionNote: draft.reflectionNote || null,
        }),
      });
      setJournal(saved);
      toast.success("Daily reflection saved.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Your reflection could not be saved.");
    } finally {
      setSavingJournal(false);
    }
  }

  function moveDay(offset: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + offset);
    setSelectedDate(localDateString(date));
  }

  const completed = habits.filter((habit) => habit.todayLog?.status === "done").length;
  const percentage = habits.length ? Math.round((completed / habits.length) * 100) : 0;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: selectedDate.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  }).format(new Date(`${selectedDate}T12:00:00`)), [selectedDate, today]);
  const journalChanged = Boolean(journal) && (
    draft.winNote !== (journal?.win_note ?? "") ||
    draft.reflectionNote !== (journal?.reflection_note ?? "")
  );

  return (
    <div className="page-stack">
      <header className="page-heading daily-heading">
        <div>
          <p>{selectedDate === today ? "TODAY’S JOURNAL" : "DAILY JOURNAL"}</p>
          <h1>{dateLabel}</h1>
          <span>A clear record of the promises you kept—not a perfect-day scorecard.</span>
        </div>
        <div className="date-navigator" aria-label="Choose journal date">
          <button type="button" onClick={() => moveDay(-1)} aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <label>
            <CalendarDays size={17} />
            <input
              type="date"
              value={selectedDate}
              max={today}
              aria-label="Journal date"
              onChange={(event) => {
                if (event.target.value) setSelectedDate(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => moveDay(1)}
            aria-label="Next day"
            disabled={selectedDate >= today}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {loading ? (
        <DayLoading />
      ) : error ? (
        <section className="page-error" role="alert">
          <CircleAlert size={24} />
          <div><strong>We couldn’t open this journal.</strong><span>{error}</span></div>
          <button type="button" onClick={() => void loadDay()}><RotateCcw size={16} /> Try again</button>
        </section>
      ) : (
        <>
          <section className="daily-score" aria-label={`${percentage}% complete`}>
            <div>
              <p>DAILY SCORE</p>
              <strong>{completed}<span> / {habits.length}</span></strong>
              <small>{habits.length ? "promises kept" : "no habits scheduled"}</small>
            </div>
            <div className="daily-score__bar">
              <span><i style={{ width: `${percentage}%` }} /></span>
              <strong>{percentage}%</strong>
            </div>
          </section>

          <section className="journal-sheet" aria-labelledby="daily-rules-title">
            <div className="journal-sheet__header">
              <div>
                <span>{selectedDate === today ? "Today" : dateLabel}</span>
                <h2 id="daily-rules-title">Your daily promises</h2>
              </div>
              <strong>{percentage}%</strong>
            </div>

            {habits.length === 0 ? (
              <div className="journal-empty">
                <Sparkles size={26} />
                <h3>A blank page for this day.</h3>
                <p>No habits are scheduled. Add or adjust habits from the Habits page.</p>
                <a href="/dashboard/habits">Manage habits</a>
              </div>
            ) : (
              <ol className="promise-list">
                {habits.map((habit) => {
                  const done = habit.todayLog?.status === "done";
                  const busy = pendingHabit === habit.id;
                  return (
                    <li key={habit.id} className={done ? "is-done" : ""}>
                      <span className="promise-index" aria-hidden="true">{habit.icon}</span>
                      <button
                        type="button"
                        className="promise-toggle"
                        onClick={() => void toggleHabit(habit)}
                        aria-pressed={done}
                        aria-label={done ? `Undo ${habit.name}` : `Mark ${habit.name} complete`}
                        disabled={Boolean(pendingHabit)}
                      >
                        <span>
                          <strong>{habit.name}</strong>
                          <small>{habitTargetLabel(habit)}</small>
                        </span>
                        <i>{busy ? <LoaderCircle className="spin" /> : done ? <Check /> : null}</i>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="reflection-card" aria-labelledby="reflection-title">
            <div className="reflection-card__heading">
              <div><p>REFLECT</p><h2 id="reflection-title">Close the day honestly</h2></div>
              <small>Private to your account</small>
            </div>
            <div className="reflection-grid">
              <label>
                <span>Today’s win</span>
                <textarea
                  maxLength={1000}
                  value={draft.winNote}
                  placeholder="What helped you stay focused or disciplined?"
                  onChange={(event) => setDraft({ ...draft, winNote: event.target.value })}
                />
                <small>{draft.winNote.length}/1000</small>
              </label>
              <label>
                <span>Tomorrow’s adjustment</span>
                <textarea
                  maxLength={1000}
                  value={draft.reflectionNote}
                  placeholder="What got in the way, and what will you change?"
                  onChange={(event) => setDraft({ ...draft, reflectionNote: event.target.value })}
                />
                <small>{draft.reflectionNote.length}/1000</small>
              </label>
            </div>
            <button
              type="button"
              className="primary-action"
              disabled={savingJournal || !journalChanged}
              onClick={() => void saveJournal()}
            >
              {savingJournal ? <LoaderCircle className="spin" /> : <Save />}
              {journalChanged ? "Save reflection" : "Reflection saved"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function habitTargetLabel(habit: TodayHabit) {
  if (habit.target != null) {
    return `${habit.target}${habit.unit ? ` ${habit.unit}` : ""}`;
  }
  return habit.habit_type === "avoid" ? "Avoid today" : "Complete once";
}

function DayLoading() {
  return (
    <div className="page-loading" aria-label="Loading daily journal">
      <span />
      <span />
      <span />
      <i className="sr-only">Loading your daily journal.</i>
    </div>
  );
}
