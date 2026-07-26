"use client";

import { CircleAlert, Clock3, LoaderCircle, Plus, RotateCcw, Sprout } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";
import type { Habit, HabitTemplate, HabitWithReminder } from "@/lib/api/types";
import { HabitCreateDialog } from "./habit-create-dialog";

export function HabitsPage() {
  const [habits, setHabits] = useState<HabitWithReminder[]>([]);
  const [templates, setTemplates] = useState<HabitTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddHabit, setShowAddHabit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextHabits, nextTemplates] = await Promise.all([
        apiRequest<HabitWithReminder[]>("/habits"),
        apiRequest<HabitTemplate[]>("/habit-templates"),
      ]);
      setHabits(nextHabits);
      setTemplates(nextTemplates);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your habits could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTemplateIds = useMemo(() => new Set(
    habits
      .map((habit) => habit.template_id)
      .filter((templateId): templateId is string => Boolean(templateId)),
  ), [habits]);

  return (
    <div className="page-stack">
      <header className="page-heading page-heading--action">
        <div>
          <p>YOUR SYSTEM</p>
          <h1>Habits</h1>
          <span>Keep the list intentional. Every active habit becomes a line in your daily journal.</span>
        </div>
        <button type="button" className="primary-action" onClick={() => setShowAddHabit(true)}>
          <Plus /> Add habit
        </button>
      </header>

      {loading ? (
        <div className="page-loading"><span /><span /><span /></div>
      ) : error ? (
        <section className="page-error" role="alert">
          <CircleAlert />
          <div><strong>We couldn’t load your habits.</strong><span>{error}</span></div>
          <button type="button" onClick={() => void load()}><RotateCcw /> Try again</button>
        </section>
      ) : habits.length === 0 ? (
        <section className="journal-empty habit-library-empty">
          <Sprout />
          <h2>Start with one promise.</h2>
          <p>Choose a suggestion or create a habit that is specific enough to check off honestly.</p>
          <button type="button" className="primary-action" onClick={() => setShowAddHabit(true)}>
            <Plus /> Add your first habit
          </button>
        </section>
      ) : (
        <section className="habit-library" aria-label="Your habits">
          <div className="section-heading-compact">
            <div><p>ACTIVE PRACTICES</p><h2>{habits.length} {habits.length === 1 ? "habit" : "habits"}</h2></div>
            <span>Shown by schedule in the daily journal</span>
          </div>
          <div className="habit-card-grid">
            {habits.map((habit) => (
              <article key={habit.id}>
                <header>
                  <span>{habit.icon}</span>
                  <small>{habit.category}</small>
                </header>
                <h3>{habit.name}</h3>
                <p>{habitDescription(habit)}</p>
                <footer>
                  <span>{frequencyLabel(habit.frequency)}</span>
                  <span className={habit.reminder_enabled ? "has-reminder" : ""}>
                    <Clock3 />
                    {habit.reminder_enabled && habit.reminder_time
                      ? habit.reminder_time.slice(0, 5)
                      : "No reminder"}
                  </span>
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      <HabitCreateDialog
        open={showAddHabit}
        onOpenChange={setShowAddHabit}
        templates={templates}
        activeTemplateIds={activeTemplateIds}
        onCreated={async (_habit: Habit) => {
          await load();
          toast.success("Habit added to your daily system.");
        }}
      />
    </div>
  );
}

function habitDescription(habit: HabitWithReminder) {
  if (habit.target != null) {
    return `Target: ${habit.target}${habit.unit ? ` ${habit.unit}` : ""}`;
  }
  if (habit.habit_type === "avoid") return "A daily boundary to protect.";
  return "A simple completion check.";
}

function frequencyLabel(frequency: unknown) {
  if (!frequency || typeof frequency !== "object" || !("kind" in frequency)) return "Daily";
  if (frequency.kind === "daily") return "Every day";
  if (frequency.kind === "weekly_target" && "target" in frequency) {
    return `${frequency.target}× per week`;
  }
  if (frequency.kind === "weekdays" && "days" in frequency && Array.isArray(frequency.days)) {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return frequency.days.map((day) => labels[Number(day)]).filter(Boolean).join(", ");
  }
  return "Custom schedule";
}
