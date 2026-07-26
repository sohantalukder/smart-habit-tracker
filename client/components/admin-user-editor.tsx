"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
import { buildAdminPasswordPayload } from "@/lib/admin-management";
import {
  queryKeys,
  type AdminUser,
  type AdminUserDetails,
  type Frequency,
} from "@/lib/queries";

type Tab = "profile" | "habits" | "activity" | "prayer" | "notifications" | "security";
type AdminMutation =
  | { kind: "profile"; body: Record<string, unknown> }
  | { kind: "habit"; habitId: string; body: Record<string, unknown> }
  | { kind: "check-in"; habitId: string; date: string; body?: Record<string, unknown>; remove?: boolean }
  | { kind: "journal"; date: string; body?: Record<string, unknown>; remove?: boolean }
  | { kind: "prayer-log"; prayer: string; date: string; body?: Record<string, unknown>; remove?: boolean }
  | { kind: "prayer-reminder"; prayer: string; body: Record<string, unknown> }
  | { kind: "prayer-settings"; body: Record<string, unknown> }
  | { kind: "notification"; deliveryId: string; operation: "retry" | "cancel" }
  | { kind: "sessions" }
  | { kind: "verification" }
  | { kind: "installation"; installationId: string; active: boolean }
  | { kind: "password"; body: Record<string, unknown> };

export function AdminUserEditor({
  user,
  open,
  onOpenChange,
  canManage,
}: {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [message, setMessage] = useState("");
  const [selectedHabitId, setSelectedHabitId] = useState("");
  const detailsQuery = useQuery({
    queryKey: queryKeys.admin.userDetails(user?.id ?? ""),
    queryFn: () => apiRequest<AdminUserDetails>(`/admin/users/${user?.id}/details`),
    enabled: open && Boolean(user?.id),
  });
  const mutation = useMutation({
    mutationFn: async (action: AdminMutation) => {
      if (!user) throw new Error("Choose a user first.");
      if (action.kind === "profile") {
        return apiRequest(
          `/admin/users/${user.id}/profile`,
          idempotentInit("PATCH", action.body),
        );
      }
      if (action.kind === "habit") {
        return apiRequest(
          `/admin/users/${user.id}/habits/${action.habitId}`,
          idempotentInit("PATCH", action.body),
        );
      }
      if (action.kind === "check-in") {
        const path = `/admin/users/${user.id}/habits/${action.habitId}/check-ins/${action.date}`;
        return apiRequest(
          path,
          action.remove
            ? idempotentInit("DELETE")
            : idempotentInit("PUT", action.body),
        );
      }
      if (action.kind === "journal") {
        const path = `/admin/users/${user.id}/journals/${action.date}`;
        return apiRequest(
          path,
          action.remove
            ? idempotentInit("DELETE")
            : idempotentInit("PUT", action.body),
        );
      }
      if (action.kind === "prayer-log") {
        const path = `/admin/users/${user.id}/prayers/${action.prayer}/logs/${action.date}`;
        return apiRequest(
          path,
          action.remove
            ? idempotentInit("DELETE")
            : idempotentInit("PUT", action.body),
        );
      }
      if (action.kind === "prayer-reminder") {
        return apiRequest(
          `/admin/users/${user.id}/prayer-reminders/${action.prayer}`,
          idempotentInit("PUT", action.body),
        );
      }
      if (action.kind === "prayer-settings") {
        return apiRequest(
          `/admin/users/${user.id}/prayer-settings`,
          idempotentInit("PATCH", action.body),
        );
      }
      if (action.kind === "notification") {
        return apiRequest(
          `/admin/notifications/${action.deliveryId}/${action.operation}`,
          idempotentInit("POST"),
        );
      }
      if (action.kind === "sessions") {
        return apiRequest(
          `/admin/users/${user.id}/sessions/revoke`,
          idempotentInit("POST"),
        );
      }
      if (action.kind === "verification") {
        return apiRequest(
          `/admin/users/${user.id}/verification-requests/invalidate`,
          idempotentInit("POST"),
        );
      }
      if (action.kind === "installation") {
        return apiRequest(
          `/admin/users/${user.id}/installations/${action.installationId}`,
          idempotentInit("PATCH", { active: action.active }),
        );
      }
      return apiRequest(
        `/admin/users/${user.id}/password`,
        idempotentInit("POST", action.body),
      );
    },
    onSuccess: async (_, action) => {
      setMessage(
        action.kind === "password"
          ? "Password changed permanently. Existing sessions were revoked."
          : "Changes saved.",
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.userDetails(user?.id ?? ""),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.analytics }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit }),
      ]);
    },
    onError: (reason) => {
      setMessage(reason instanceof Error ? reason.message : "The change could not be saved.");
    },
  });

  useEffect(() => {
    if (open) {
      setTab("profile");
      setMessage("");
      setSelectedHabitId("");
    }
  }, [open, user?.id]);

  const details = detailsQuery.data;
  const selectedHabit = details?.habits.find((habit) => habit.id === selectedHabitId)
    ?? details?.habits[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-user-dialog">
        <DialogHeader>
          <DialogTitle>{user?.name || "User details"}</DialogTitle>
          <DialogDescription>
            {user?.email} · {canManage ? "Super-admin editing" : "Read-only support view"}
          </DialogDescription>
        </DialogHeader>
        <div className="admin-dialog-tabs" role="tablist" aria-label="User management sections">
          {(["profile", "habits", "activity", "prayer", "notifications", "security"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "active" : ""}
              onClick={() => {
                setTab(item);
                setMessage("");
              }}
            >
              {item}
            </button>
          ))}
        </div>
        {detailsQuery.isPending && (
          <div className="admin-dialog-loading"><LoaderCircle className="spin" /> Loading user data…</div>
        )}
        {detailsQuery.error && (
          <div className="admin-error" role="alert">
            {detailsQuery.error instanceof Error
              ? detailsQuery.error.message
              : "User details could not be loaded."}
          </div>
        )}
        {details && tab === "profile" && (
          <ProfileEditor
            details={details}
            disabled={!canManage || mutation.isPending}
            onSave={(body) => mutation.mutate({ kind: "profile", body })}
          />
        )}
        {details && tab === "habits" && (
          <HabitEditor
            details={details}
            selectedId={selectedHabit?.id ?? ""}
            onSelect={setSelectedHabitId}
            disabled={!canManage || mutation.isPending}
            onSave={(habitId, body) => mutation.mutate({ kind: "habit", habitId, body })}
          />
        )}
        {details && tab === "activity" && (
          <ActivityEditor
            details={details}
            disabled={!canManage || mutation.isPending}
            onCheckIn={(habitId, date, body, remove) =>
              mutation.mutate({ kind: "check-in", habitId, date, body, remove })}
            onJournal={(date, body, remove) =>
              mutation.mutate({ kind: "journal", date, body, remove })}
          />
        )}
        {details && tab === "prayer" && (
          <PrayerEditor
            details={details}
            disabled={!canManage || mutation.isPending}
            onLog={(prayer, date, body, remove) =>
              mutation.mutate({ kind: "prayer-log", prayer, date, body, remove })}
            onReminder={(prayer, body) =>
              mutation.mutate({ kind: "prayer-reminder", prayer, body })}
            onSettings={(body) =>
              mutation.mutate({ kind: "prayer-settings", body })}
          />
        )}
        {details && tab === "notifications" && (
          <UserNotifications
            details={details}
            disabled={!canManage || mutation.isPending}
            onOperation={(deliveryId, operation) =>
              mutation.mutate({ kind: "notification", deliveryId, operation })}
          />
        )}
        {details && tab === "security" && (
          <SecurityEditor
            details={details}
            disabled={!canManage || mutation.isPending}
            canManage={canManage}
            onSave={(body) => mutation.mutate({ kind: "password", body })}
            onRevokeSessions={() => mutation.mutate({ kind: "sessions" })}
            onInvalidateVerification={() => mutation.mutate({ kind: "verification" })}
            onInstallation={(installationId, active) =>
              mutation.mutate({ kind: "installation", installationId, active })}
          />
        )}
        {message && (
          <div
            className={mutation.isError ? "admin-dialog-message error" : "admin-dialog-message"}
            role="status"
          >
            {message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileEditor({
  details,
  disabled,
  onSave,
}: {
  details: AdminUserDetails;
  disabled: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const account = details.account;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      timezone: String(form.get("timezone") ?? "").trim(),
      units: String(form.get("units") ?? "metric"),
      goals: form.getAll("goals").map(String),
      pace: String(form.get("pace") ?? "balanced"),
      religion: String(form.get("religion") ?? "unspecified"),
      dailyDigestTime: String(form.get("dailyDigestTime") ?? "20:00"),
      dailyDigestEnabled: form.get("dailyDigestEnabled") === "on",
      role: form.get("role") ? String(form.get("role")) : null,
    });
  }
  return (
    <form className="admin-editor-form" onSubmit={submit} key={account.updated_at}>
      <div className="admin-form-grid">
        <Field label="Name"><Input name="name" defaultValue={account.name} required disabled={disabled} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={account.email} required disabled={disabled} /></Field>
        <Field label="Timezone"><Input name="timezone" defaultValue={account.timezone} required disabled={disabled} /></Field>
        <Field label="Units">
          <select name="units" defaultValue={account.units} disabled={disabled}>
            <option value="metric">Metric</option>
            <option value="imperial">Imperial</option>
          </select>
        </Field>
        <Field label="Starting pace">
          <select name="pace" defaultValue={account.starting_pace} disabled={disabled}>
            <option value="light">Light</option>
            <option value="balanced">Balanced</option>
            <option value="ambitious">Ambitious</option>
          </select>
        </Field>
        <Field label="Religion">
          <select name="religion" defaultValue={account.religion_preference} disabled={disabled}>
            <option value="unspecified">Unspecified</option>
            <option value="muslim">Muslim</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Administrator role">
          <select name="role" defaultValue={account.role ?? ""} disabled={disabled}>
            <option value="">Standard user</option>
            <option value="support">Support</option>
            <option value="super_admin">Super admin</option>
          </select>
        </Field>
        <Field label="Digest time"><Input name="dailyDigestTime" type="time" defaultValue={account.daily_digest_time.slice(0, 5)} disabled={disabled} /></Field>
        <label className="admin-checkbox">
          <input name="dailyDigestEnabled" type="checkbox" defaultChecked={account.daily_digest_enabled} disabled={disabled} />
          Daily digest enabled
        </label>
      </div>
      <fieldset className="admin-check-group" disabled={disabled}>
        <legend>Goals</legend>
        {["movement", "nutrition", "learning", "sleep", "mindfulness"].map((goal) => (
          <label key={goal}>
            <input name="goals" type="checkbox" value={goal} defaultChecked={account.goal_preferences.includes(goal)} />
            {goal}
          </label>
        ))}
      </fieldset>
      {!disabled && <Button><Save /> Save profile</Button>}
    </form>
  );
}

function HabitEditor({
  details,
  selectedId,
  onSelect,
  disabled,
  onSave,
}: {
  details: AdminUserDetails;
  selectedId: string;
  onSelect: (id: string) => void;
  disabled: boolean;
  onSave: (id: string, body: Record<string, unknown>) => void;
}) {
  const habit = details.habits.find((item) => item.id === selectedId);
  if (!habit) return <p className="admin-dialog-empty">This user has no habits.</p>;
  const habitId = habit.id;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave(habitId, {
      name: String(form.get("name") ?? "").trim(),
      icon: String(form.get("icon") ?? "").trim(),
      category: String(form.get("category") ?? "other"),
      type: String(form.get("type") ?? "do"),
      target: optionalNumber(form.get("target")),
      unit: optionalText(form.get("unit")),
      frequency: parseFrequency(form),
      forgiving: form.get("forgiving") === "on",
      state: String(form.get("state") ?? "active"),
      reminderEnabled: form.get("reminderEnabled") === "on",
      reminderTime: optionalText(form.get("reminderTime")),
    });
  }
  return (
    <div className="admin-editor-split">
      <nav aria-label="User habits">
        {details.habits.map((item) => (
          <button key={item.id} type="button" className={item.id === habit.id ? "active" : ""} onClick={() => onSelect(item.id)}>
            <span>{item.icon}</span><strong>{item.name}</strong><small>{item.state}</small>
          </button>
        ))}
      </nav>
      <form className="admin-editor-form" onSubmit={submit} key={habit.id}>
        <div className="admin-form-grid">
          <Field label="Name"><Input name="name" defaultValue={habit.name} required disabled={disabled} /></Field>
          <Field label="Icon"><Input name="icon" defaultValue={habit.icon} required disabled={disabled} /></Field>
          <Field label="Category">
            <select name="category" defaultValue={habit.category} disabled={disabled}>
              {["diet", "prayer", "steps", "gym", "food", "learning", "other"].map(option)}
            </select>
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={habit.habit_type} disabled={disabled}>
              {["do", "avoid", "count", "duration"].map(option)}
            </select>
          </Field>
          <Field label="Target"><Input name="target" type="number" min="0.01" step="any" defaultValue={habit.target ?? ""} disabled={disabled} /></Field>
          <Field label="Unit"><Input name="unit" defaultValue={habit.unit ?? ""} disabled={disabled} /></Field>
          <Field label="Schedule">
            <select name="frequencyKind" defaultValue={habit.frequency.kind} disabled={disabled}>
              <option value="daily">Daily</option>
              <option value="weekly_target">Weekly target</option>
              <option value="weekdays">Weekdays</option>
            </select>
          </Field>
          <Field label="Weekly target / weekday numbers">
            <Input
              name="frequencyValue"
              defaultValue={frequencyValue(habit.frequency)}
              placeholder="3 or 1,2,3,4,5"
              disabled={disabled}
            />
          </Field>
          <Field label="State">
            <select name="state" defaultValue={habit.state} disabled={disabled}>
              {["active", "paused", "archived"].map(option)}
            </select>
          </Field>
          <label className="admin-checkbox">
            <input name="forgiving" type="checkbox" defaultChecked={habit.forgiving} disabled={disabled} />
            Forgiving habit
          </label>
          <label className="admin-checkbox">
            <input name="reminderEnabled" type="checkbox" defaultChecked={Boolean(habit.reminder_enabled)} disabled={disabled} />
            Reminder enabled
          </label>
          <Field label="Reminder time">
            <Input name="reminderTime" type="time" defaultValue={habit.reminder_time?.slice(0, 5) ?? ""} disabled={disabled} />
          </Field>
        </div>
        {!disabled && <Button><Save /> Save habit</Button>}
      </form>
    </div>
  );
}

function ActivityEditor({
  details,
  disabled,
  onCheckIn,
  onJournal,
}: {
  details: AdminUserDetails;
  disabled: boolean;
  onCheckIn: (habitId: string, date: string, body?: Record<string, unknown>, remove?: boolean) => void;
  onJournal: (date: string, body?: Record<string, unknown>, remove?: boolean) => void;
}) {
  return (
    <div className="admin-activity-editor">
      <section>
        <h3>Recent check-ins</h3>
        {details.checkIns.length ? details.checkIns.map((row) => (
          <form
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onCheckIn(row.habit_id, dateOnly(row.local_date), {
                status: String(form.get("status")),
                value: optionalNumber(form.get("value")),
                note: optionalText(form.get("note")),
                prayerStatus: optionalText(form.get("prayerStatus")),
              });
            }}
          >
            <strong>{row.habit_name}</strong><small>{dateOnly(row.local_date)}</small>
            <select name="status" defaultValue={row.status} disabled={disabled}>{["done", "partial", "skipped"].map(option)}</select>
            <Input name="value" type="number" min="0" step="any" defaultValue={row.value ?? ""} placeholder="Value" disabled={disabled} />
            <Input name="note" defaultValue={row.note ?? ""} placeholder="Note" disabled={disabled} />
            <select name="prayerStatus" defaultValue={row.prayer_status ?? ""} disabled={disabled}>
              <option value="">No prayer status</option>
              {["on_time", "late", "missed"].map(option)}
            </select>
            {!disabled && <div><Button size="sm"><Save /> Save</Button><Button size="sm" type="button" variant="danger" onClick={() => confirmAction("Delete this check-in?") && onCheckIn(row.habit_id, dateOnly(row.local_date), undefined, true)}><Trash2 /> Delete</Button></div>}
          </form>
        )) : <p>No check-ins recorded.</p>}
      </section>
      <section>
        <h3>Recent journals</h3>
        {details.journals.length ? details.journals.map((row) => (
          <form
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onJournal(dateOnly(row.local_date), {
                winNote: optionalText(form.get("winNote")),
                reflectionNote: optionalText(form.get("reflectionNote")),
              });
            }}
          >
            <strong>{dateOnly(row.local_date)}</strong>
            <Textarea name="winNote" defaultValue={row.win_note ?? ""} placeholder="Win note" disabled={disabled} />
            <Textarea name="reflectionNote" defaultValue={row.reflection_note ?? ""} placeholder="Reflection note" disabled={disabled} />
            {!disabled && <div><Button size="sm"><Save /> Save</Button><Button size="sm" type="button" variant="danger" onClick={() => confirmAction("Delete this journal entry?") && onJournal(dateOnly(row.local_date), undefined, true)}><Trash2 /> Delete</Button></div>}
          </form>
        )) : <p>No journal entries recorded.</p>}
      </section>
    </div>
  );
}

function PrayerEditor({
  details,
  disabled,
  onLog,
  onReminder,
  onSettings,
}: {
  details: AdminUserDetails;
  disabled: boolean;
  onLog: (
    prayer: string,
    date: string,
    body?: Record<string, unknown>,
    remove?: boolean,
  ) => void;
  onReminder: (prayer: string, body: Record<string, unknown>) => void;
  onSettings: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="admin-activity-editor">
      <section>
        <h3>Prayer settings</h3>
        <form
          className="admin-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const enabled = form.get("enabled") === "on";
            const latitude = String(form.get("latitude") ?? "");
            const longitude = String(form.get("longitude") ?? "");
            onSettings({
              enabled,
              latitude: enabled && latitude !== "" ? Number(latitude) : null,
              longitude: enabled && longitude !== "" ? Number(longitude) : null,
              madhab: enabled ? String(form.get("madhab")) : null,
              calculationMethod: enabled ? String(form.get("calculationMethod")) : null,
            });
          }}
        >
          <label className="admin-checkbox">
            <input name="enabled" type="checkbox" defaultChecked={details.account.prayer_enabled} disabled={disabled} />
            Prayer features enabled
          </label>
          <Field label="Latitude"><Input name="latitude" type="number" step="0.00001" min={-90} max={90} defaultValue={details.account.latitude ?? ""} disabled={disabled} /></Field>
          <Field label="Longitude"><Input name="longitude" type="number" step="0.00001" min={-180} max={180} defaultValue={details.account.longitude ?? ""} disabled={disabled} /></Field>
          <Field label="Madhab">
            <select name="madhab" defaultValue={details.account.madhab ?? "hanafi"} disabled={disabled}>
              {["hanafi", "shafi", "maliki", "hanbali"].map(option)}
            </select>
          </Field>
          <Field label="Calculation method">
            <select name="calculationMethod" defaultValue={details.account.prayer_calculation_method ?? "karachi"} disabled={disabled}>
              {["karachi", "muslim_world_league", "egyptian", "umm_al_qura", "dubai", "qatar", "kuwait", "moonsighting_committee", "singapore", "turkey", "tehran", "north_america"].map(option)}
            </select>
          </Field>
          {!disabled && <Button><Save /> Save prayer settings</Button>}
        </form>
      </section>
      <section>
        <h3>Prayer reminders</h3>
        {(["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((prayer) => {
          const reminder = details.prayerReminders.find(
            (item) => item.prayer_name === prayer,
          );
          return (
            <form
              key={prayer}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                onReminder(prayer, {
                  enabled: form.get("enabled") === "on",
                  offsetMinutes: Number(form.get("offsetMinutes") ?? 0),
                });
              }}
            >
              <strong>{prayer}</strong>
              <label className="admin-checkbox">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={reminder?.enabled ?? true}
                  disabled={disabled}
                />
                Enabled
              </label>
              <Input
                name="offsetMinutes"
                type="number"
                min={0}
                max={120}
                defaultValue={reminder?.offset_minutes ?? 0}
                disabled={disabled}
                aria-label={`${prayer} reminder offset in minutes`}
              />
              {!disabled && <Button size="sm"><Save /> Save</Button>}
            </form>
          );
        })}
      </section>
      <section>
        <h3>Recent prayer records</h3>
        {details.prayerLogs.length ? details.prayerLogs.map((row) => (
          <form
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onLog(row.prayer_name, dateOnly(row.local_date), {
                status: String(form.get("status")),
              });
            }}
          >
            <strong>{row.prayer_name}</strong>
            <small>{dateOnly(row.local_date)}</small>
            <select name="status" defaultValue={row.status} disabled={disabled}>
              {["on_time", "late", "missed"].map(option)}
            </select>
            {!disabled && (
              <div>
                <Button size="sm"><Save /> Save</Button>
                <Button
                  size="sm"
                  type="button"
                  variant="danger"
                  onClick={() =>
                    confirmAction("Delete this prayer record?") &&
                    onLog(row.prayer_name, dateOnly(row.local_date), undefined, true)}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            )}
          </form>
        )) : <p>No prayer records found.</p>}
      </section>
    </div>
  );
}

function UserNotifications({
  details,
  disabled,
  onOperation,
}: {
  details: AdminUserDetails;
  disabled: boolean;
  onOperation: (deliveryId: string, operation: "retry" | "cancel") => void;
}) {
  return (
    <div className="admin-activity-editor">
      <section>
        <h3>Notification deliveries</h3>
        {details.notifications.length ? details.notifications.map((row) => (
          <article className="admin-notification-record" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <small>{row.channel} · {new Date(row.scheduled_at).toLocaleString()}</small>
              {row.body && <p>{row.body}</p>}
              {row.error_message && <p className="error">{row.error_message}</p>}
            </div>
            <span>{row.state}</span>
            {!disabled && row.state === "failed" && (
              <Button size="sm" variant="secondary" onClick={() => onOperation(row.id, "retry")}>
                <RefreshCw /> Retry
              </Button>
            )}
            {!disabled && ["scheduled", "failed"].includes(row.state) && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => confirmAction("Cancel this notification?") && onOperation(row.id, "cancel")}
              >
                <BellRing /> Cancel
              </Button>
            )}
          </article>
        )) : <p>No notification deliveries found.</p>}
      </section>
    </div>
  );
}

function SecurityEditor({
  details,
  disabled,
  canManage,
  onSave,
  onRevokeSessions,
  onInvalidateVerification,
  onInstallation,
}: {
  details: AdminUserDetails;
  disabled: boolean;
  canManage: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onRevokeSessions: () => void;
  onInvalidateVerification: () => void;
  onInstallation: (installationId: string, active: boolean) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) return;
    onSave(buildAdminPasswordPayload(
      newPassword,
      confirmation,
      String(form.get("adminPassword") ?? ""),
    ));
    event.currentTarget.reset();
  }
  if (!canManage) {
    return (
      <div className="admin-editor-form">
        <div className="admin-security-note">
          <ShieldCheck />
          <div><strong>Read-only security view</strong><p>Password and operational changes require super-admin access.</p></div>
        </div>
        <section className="admin-security-records">
          <h3>Sessions</h3>
          <p>{details.sessions.filter((session) => !session.revoked_at).length} active of {details.sessions.length} recent sessions.</p>
          <h3>Verification requests</h3>
          <p>{details.verificationRequests.filter((request) => !request.consumed_at).length} pending requests.</p>
        </section>
        <section className="admin-security-records">
          <h3>Push installations</h3>
          {details.installations.length ? details.installations.map((installation) => (
            <div key={installation.id}>
              <span>
                <strong>{installation.platform}</strong>
                <small>{installation.active ? "Active" : "Inactive"} · Last seen {new Date(installation.last_seen_at).toLocaleString()}</small>
              </span>
            </div>
          )) : <p>No push installations.</p>}
        </section>
      </div>
    );
  }
  return (
    <form className="admin-editor-form admin-security-form" onSubmit={submit}>
      <div className="admin-security-note">
        <KeyRound />
        <div><strong>Permanent password change</strong><p>This replaces the user’s password and revokes every existing session.</p></div>
      </div>
      <Field label="New permanent password"><Input name="newPassword" type="password" minLength={8} maxLength={128} required disabled={disabled} /></Field>
      <Field label="Confirm new password"><Input name="confirmation" type="password" minLength={8} maxLength={128} required disabled={disabled} /></Field>
      <Field label="Your administrator password"><Input name="adminPassword" type="password" minLength={1} maxLength={128} required disabled={disabled} /></Field>
      <Button variant="danger" disabled={disabled}><KeyRound /> Change password permanently</Button>
      <section className="admin-security-records">
        <h3>Sessions</h3>
        <p>
          {details.sessions.filter((session) => !session.revoked_at).length} active of{" "}
          {details.sessions.length} recent sessions.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => confirmAction("Revoke every active session for this user?") && onRevokeSessions()}
        >
          Revoke all sessions
        </Button>
        <h3>Verification requests</h3>
        <p>
          {details.verificationRequests.filter((request) => !request.consumed_at).length} pending requests.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => confirmAction("Invalidate all pending verification requests?") && onInvalidateVerification()}
        >
          Invalidate pending requests
        </Button>
      </section>
      <section className="admin-security-records">
        <h3>Push installations</h3>
        {details.installations.length ? details.installations.map((installation) => (
          <div key={installation.id}>
            <span>
              <strong>{installation.platform}</strong>
              <small>Last seen {new Date(installation.last_seen_at).toLocaleString()}</small>
            </span>
            <Button
              type="button"
              size="sm"
              variant={installation.active ? "danger" : "secondary"}
              disabled={disabled}
              onClick={() => onInstallation(installation.id, !installation.active)}
            >
              {installation.active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        )) : <p>No push installations.</p>}
      </section>
    </form>
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

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function confirmAction(message: string) {
  return window.confirm(message);
}
