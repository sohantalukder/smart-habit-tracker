"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, LoaderCircle, Plus, Sparkles, Sprout } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import type { Habit, HabitTemplate } from "@/lib/api/types";
import {
  buildCustomHabitPayload,
  type HabitCategory,
  type HabitDraft,
  type HabitFrequencyKind,
  type HabitTrackingType,
  validateHabitDraft,
} from "@/lib/habit-form";
import { queryKeys } from "@/lib/queries";

type Mode = "suggestions" | "custom";

const initialDraft: HabitDraft = {
  name: "",
  icon: "🌱",
  category: "other",
  type: "do",
  target: "",
  unit: "",
  frequencyKind: "daily",
  weekdays: [1, 2, 3, 4, 5],
  weeklyTarget: 3,
  forgiving: false,
};

const categories: Array<{ value: HabitCategory; label: string }> = [
  { value: "diet", label: "Diet" },
  { value: "prayer", label: "Prayer" },
  { value: "steps", label: "Steps" },
  { value: "gym", label: "Gym" },
  { value: "food", label: "Food" },
  { value: "learning", label: "Learning" },
  { value: "other", label: "Other" },
];

const trackingTypes: Array<{
  value: HabitTrackingType;
  label: string;
  description: string;
}> = [
  { value: "do", label: "Do", description: "A simple completion check" },
  { value: "avoid", label: "Avoid", description: "Notice a choice gently" },
  { value: "count", label: "Count", description: "Track steps, glasses, or pages" },
  { value: "duration", label: "Duration", description: "Track minutes or hours" },
];

const frequencyOptions: Array<{
  value: HabitFrequencyKind;
  label: string;
}> = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Selected weekdays" },
  { value: "weekly_target", label: "Weekly target" },
];

const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitCreateDialog({
  open,
  onOpenChange,
  templates,
  activeTemplateIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: HabitTemplate[];
  activeTemplateIds: Set<string>;
  onCreated: (habit: Habit) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("suggestions");
  const [draft, setDraft] = useState<HabitDraft>(initialDraft);
  const [submitting, setSubmitting] = useState("");
  const [error, setError] = useState("");
  const tracksAmount = draft.type === "count" || draft.type === "duration";
  const availableTemplates = useMemo(
    () => templates.filter((template) => Boolean(template.id)),
    [templates],
  );
  const createHabitMutation = useMutation({
    mutationFn: (payload: { templateId: string } | ReturnType<typeof buildCustomHabitPayload>) =>
      apiRequest<Habit>("/habits", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.user.habits }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.todayRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.trackingRoot }),
      ]);
    },
  });

  function close(nextOpen: boolean) {
    if (submitting) return;
    setError("");
    onOpenChange(nextOpen);
  }

  async function createFromTemplate(template: HabitTemplate) {
    if (!template.id || activeTemplateIds.has(template.id) || submitting) return;
    setSubmitting(template.id);
    setError("");
    try {
      const habit = await createHabitMutation.mutateAsync({
        templateId: template.id,
      });
      await onCreated(habit);
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The suggested habit could not be added.",
      );
    } finally {
      setSubmitting("");
    }
  }

  async function createCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validation = validateHabitDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting("custom");
    setError("");
    try {
      const habit = await createHabitMutation.mutateAsync(
        buildCustomHabitPayload(draft),
      );
      await onCreated(habit);
      setDraft(initialDraft);
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your custom habit could not be created.",
      );
    } finally {
      setSubmitting("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="habit-create-dialog">
        <DialogHeader>
          <span className="habit-create-mark"><Sprout size={22} /></span>
          <DialogTitle>Grow a new habit</DialogTitle>
          <DialogDescription>
            Start from a Bloom suggestion or shape a practice around your own promise.
          </DialogDescription>
        </DialogHeader>

        <div className="habit-create-tabs" role="tablist" aria-label="Habit creation mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "suggestions"}
            className={mode === "suggestions" ? "active" : ""}
            onClick={() => { setMode("suggestions"); setError(""); }}
          >
            Suggestions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "custom"}
            className={mode === "custom" ? "active" : ""}
            onClick={() => { setMode("custom"); setError(""); }}
          >
            Custom habit
          </button>
        </div>

        {error && <div className="habit-create-error" role="alert">{error}</div>}

        {mode === "suggestions" ? (
          <div className="habit-suggestion-grid">
            {availableTemplates.map((template) => {
              const active = template.id ? activeTemplateIds.has(template.id) : false;
              const busy = submitting === template.id;
              return (
                <article key={template.id ?? template.name}>
                  <span>{template.icon}</span>
                  <div>
                    <p>{template.category}</p>
                    <h3>{template.name}</h3>
                    <small>{template.description || templateSummary(template)}</small>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "outline"}
                    disabled={active || Boolean(submitting)}
                    onClick={() => void createFromTemplate(template)}
                  >
                    {busy ? <LoaderCircle className="spin" /> : active ? <Check /> : <Plus />}
                    {active ? "Added" : "Add"}
                  </Button>
                </article>
              );
            })}
            {availableTemplates.length === 0 && (
              <p className="habit-suggestion-empty">No suggestions are available right now.</p>
            )}
          </div>
        ) : (
          <form className="habit-custom-form" onSubmit={createCustom}>
            <div className="habit-form-row habit-form-row--name">
              <Label htmlFor="habit-name">
                Habit name
                <Input
                  id="habit-name"
                  autoFocus
                  maxLength={80}
                  value={draft.name}
                  placeholder="Stretch after waking"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Label>
              <Label htmlFor="habit-icon">
                Icon
                <Input
                  id="habit-icon"
                  maxLength={8}
                  value={draft.icon}
                  aria-label="Habit icon"
                  onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
                />
              </Label>
            </div>

            <div className="habit-form-row">
              <Label htmlFor="habit-category">
                Category
                <select
                  id="habit-category"
                  value={draft.category}
                  onChange={(event) => setDraft({
                    ...draft,
                    category: event.target.value as HabitCategory,
                  })}
                >
                  {categories.map((category) => (
                    <option value={category.value} key={category.value}>{category.label}</option>
                  ))}
                </select>
              </Label>
              <Label htmlFor="habit-frequency">
                Frequency
                <select
                  id="habit-frequency"
                  value={draft.frequencyKind}
                  onChange={(event) => setDraft({
                    ...draft,
                    frequencyKind: event.target.value as HabitFrequencyKind,
                  })}
                >
                  {frequencyOptions.map((frequency) => (
                    <option value={frequency.value} key={frequency.value}>{frequency.label}</option>
                  ))}
                </select>
              </Label>
            </div>

            <fieldset className="habit-tracking-types">
              <legend>How will you track it?</legend>
              <div>
                {trackingTypes.map((tracking) => (
                  <button
                    type="button"
                    className={draft.type === tracking.value ? "active" : ""}
                    onClick={() => setDraft({
                      ...draft,
                      type: tracking.value,
                      icon: typeIcon(tracking.value),
                    })}
                    key={tracking.value}
                  >
                    <strong>{tracking.label}</strong>
                    <small>{tracking.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            {tracksAmount && (
              <div className="habit-form-row">
                <Label htmlFor="habit-target">
                  Target
                  <Input
                    id="habit-target"
                    type="number"
                    min="0.01"
                    step="any"
                    value={draft.target}
                    placeholder={draft.type === "duration" ? "20" : "8"}
                    onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                  />
                </Label>
                <Label htmlFor="habit-unit">
                  Unit
                  <Input
                    id="habit-unit"
                    maxLength={24}
                    value={draft.unit}
                    placeholder={draft.type === "duration" ? "minutes" : "glasses"}
                    onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                  />
                </Label>
              </div>
            )}

            {draft.frequencyKind === "weekdays" && (
              <fieldset className="habit-weekdays">
                <legend>Active weekdays</legend>
                <div>
                  {weekdayLabels.map((label, day) => {
                    const selected = draft.weekdays.includes(day);
                    return (
                      <button
                        type="button"
                        aria-pressed={selected}
                        className={selected ? "active" : ""}
                        onClick={() => setDraft({
                          ...draft,
                          weekdays: selected
                            ? draft.weekdays.filter((value) => value !== day)
                            : [...draft.weekdays, day],
                        })}
                        key={`${label}-${day}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {draft.frequencyKind === "weekly_target" && (
              <Label htmlFor="habit-weekly-target">
                Times per week
                <Input
                  id="habit-weekly-target"
                  type="number"
                  min="1"
                  max="7"
                  value={draft.weeklyTarget}
                  onChange={(event) => setDraft({
                    ...draft,
                    weeklyTarget: Number(event.target.value),
                  })}
                />
              </Label>
            )}

            <label className="habit-forgiving">
              <input
                type="checkbox"
                checked={draft.forgiving}
                onChange={(event) => setDraft({
                  ...draft,
                  forgiving: event.target.checked,
                })}
              />
              <span>
                <strong>Forgiving mode</strong>
                <small>Missed days stay informative, never punitive.</small>
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={Boolean(submitting)}>
                {submitting === "custom"
                  ? <LoaderCircle className="spin" />
                  : <Sparkles />}
                Create habit
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function typeIcon(type: HabitTrackingType) {
  if (type === "avoid") return "🫶";
  if (type === "count") return "🔢";
  if (type === "duration") return "⏱️";
  return "🌱";
}

function templateSummary(template: HabitTemplate) {
  if (template.default_target) {
    return `${template.default_target} ${template.default_unit ?? ""}`.trim();
  }
  return "A gentle daily check-in.";
}
