"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, idempotentInit } from "@/lib/api";
import { queryKeys, type AdminTemplate, type Frequency } from "@/lib/queries";

export function AdminTemplateEditor({
  template,
  open,
  onOpenChange,
}: {
  template: AdminTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(
        template ? `/admin/templates/${template.id}` : "/admin/templates",
        idempotentInit(template ? "PATCH" : "POST", body),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.templates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.habitTemplates }),
      ]);
      onOpenChange(false);
    },
    onError: (reason) => {
      setMessage(reason instanceof Error ? reason.message : "The template could not be saved.");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      slug: String(form.get("slug") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      category: String(form.get("category") ?? "other"),
      type: String(form.get("type") ?? "do"),
      icon: String(form.get("icon") ?? "").trim(),
      target: optionalNumber(form.get("target")),
      unit: optionalText(form.get("unit")),
      frequency: parseFrequency(form),
      goals: form.getAll("goals").map(String),
      priority: Number(form.get("priority") ?? 100),
      active: form.get("active") === "on",
    });
  }

  const frequency = template?.default_frequency ?? { kind: "daily" };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-template-dialog">
        <DialogHeader>
          <DialogTitle>{template ? "Edit habit template" : "Create habit template"}</DialogTitle>
          <DialogDescription>
            Templates are validated before they become available in onboarding and habit creation.
          </DialogDescription>
        </DialogHeader>
        <form className="admin-editor-form" onSubmit={submit} key={template?.id ?? "new"}>
          <div className="admin-form-grid">
            <Field label="Name"><Input name="name" defaultValue={template?.name ?? ""} required /></Field>
            <Field label="Slug"><Input name="slug" defaultValue={template?.slug ?? ""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
            <Field label="Icon"><Input name="icon" defaultValue={template?.icon ?? "🌱"} required /></Field>
            <Field label="Category">
              <select name="category" defaultValue={template?.category ?? "other"}>
                {["diet", "prayer", "steps", "gym", "food", "learning", "other"].map(option)}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" defaultValue={template?.habit_type ?? "do"}>
                {["do", "avoid", "count", "duration"].map(option)}
              </select>
            </Field>
            <Field label="Target"><Input name="target" type="number" min="0.01" step="any" defaultValue={template?.default_target ?? ""} /></Field>
            <Field label="Unit"><Input name="unit" defaultValue={template?.default_unit ?? ""} /></Field>
            <Field label="Schedule">
              <select name="frequencyKind" defaultValue={frequency.kind}>
                <option value="daily">Daily</option>
                <option value="weekly_target">Weekly target</option>
                <option value="weekdays">Weekdays</option>
              </select>
            </Field>
            <Field label="Weekly target / weekday numbers">
              <Input name="frequencyValue" defaultValue={frequencyValue(frequency)} placeholder="3 or 1,2,3,4,5" />
            </Field>
            <Field label="Recommendation priority">
              <Input name="priority" type="number" min="0" max="1000" defaultValue={template?.recommendation_priority ?? 100} required />
            </Field>
          </div>
          <Field label="Description"><Textarea name="description" maxLength={500} defaultValue={template?.description ?? ""} /></Field>
          <fieldset className="admin-check-group">
            <legend>Goal tags</legend>
            {["movement", "nutrition", "learning", "sleep", "mindfulness"].map((goal) => (
              <label key={goal}>
                <input name="goals" type="checkbox" value={goal} defaultChecked={template?.goal_tags?.includes(goal)} />
                {goal}
              </label>
            ))}
          </fieldset>
          <label className="admin-checkbox">
            <input name="active" type="checkbox" defaultChecked={template?.active ?? true} />
            Active and visible to users
          </label>
          {message && <div className="admin-dialog-message error" role="alert">{message}</div>}
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? <LoaderCircle className="spin" /> : <Save />}
            {template ? "Save template" : "Create template"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="admin-field"><span>{label}</span>{children}</label>;
}

function option(value: string) {
  return <option value={value} key={value}>{value.replaceAll("_", " ")}</option>;
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseFrequency(form: FormData): Frequency {
  const kind = String(form.get("frequencyKind") ?? "daily");
  const raw = String(form.get("frequencyValue") ?? "");
  if (kind === "weekly_target") {
    return { kind, target: Math.min(7, Math.max(1, Number(raw) || 1)) };
  }
  if (kind === "weekdays") {
    const days = [...new Set(raw.split(",").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    return { kind, days: days.length ? days : [1, 2, 3, 4, 5] };
  }
  return { kind: "daily" };
}

function frequencyValue(frequency: Frequency) {
  if (frequency.kind === "weekly_target") return String(frequency.target);
  if (frequency.kind === "weekdays") return frequency.days.join(",");
  return "";
}
