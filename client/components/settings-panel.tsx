"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Check,
  Crosshair,
  LoaderCircle,
  MapPin,
  Save,
  Settings2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import type {
  ExperienceProfile,
  GoalPreference,
  HabitWithReminder,
  Madhab,
  PrayerReminderSetting,
  ReligionPreference,
} from "@/lib/api/types";
import {
  currentPushState,
  enablePushNotifications,
  unregisterPushNotifications,
} from "@/lib/firebase-messaging";
import { queryKeys } from "@/lib/queries";

const allGoals: GoalPreference[] = [
  "movement",
  "nutrition",
  "learning",
  "sleep",
  "mindfulness",
];
const prayerNames = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const methods = [
  ["karachi", "Karachi"],
  ["muslim_world_league", "Muslim World League"],
  ["egyptian", "Egyptian"],
  ["umm_al_qura", "Umm al-Qura"],
  ["dubai", "Dubai"],
  ["qatar", "Qatar"],
  ["kuwait", "Kuwait"],
  ["moonsighting_committee", "Moonsighting Committee"],
  ["singapore", "Singapore"],
  ["turkey", "Turkey"],
  ["tehran", "Tehran"],
  ["north_america", "North America"],
] as const;

export function SettingsPanel({
  profile,
  habits,
}: {
  profile: ExperienceProfile;
  habits: HabitWithReminder[];
}) {
  const queryClient = useQueryClient();
  const [goals, setGoals] = useState<GoalPreference[]>(
    profile.goal_preferences?.length
      ? profile.goal_preferences
      : ["movement"],
  );
  const [pace, setPace] = useState(profile.starting_pace ?? "balanced");
  const [religion, setReligion] = useState<ReligionPreference>(
    profile.religion_preference ?? "unspecified",
  );
  const [digestTime, setDigestTime] = useState(
    String(profile.daily_digest_time ?? "20:00").slice(0, 5),
  );
  const [digestEnabled, setDigestEnabled] = useState(
    profile.daily_digest_enabled ?? true,
  );
  const [location, setLocation] = useState(() => (
    profile.latitude != null && profile.longitude != null
      ? {
          latitude: Number(profile.latitude),
          longitude: Number(profile.longitude),
          timezone: profile.timezone,
        }
      : null
  ));
  const [madhab, setMadhab] = useState<Madhab>(profile.madhab ?? "hanafi");
  const [method, setMethod] = useState<string>(
    profile.prayer_calculation_method ?? "karachi",
  );
  const [prayerReminders, setPrayerReminders] = useState<PrayerReminderSetting[]>(
    prayerNames.map((prayer) => profile.prayer_reminders?.find(
      (setting) => setting.prayer_name === prayer,
    ) ?? {
      prayer_name: prayer,
      enabled: true,
      offset_minutes: 0,
    }),
  );
  const [pushState, setPushState] = useState(currentPushState());
  const [pushSaving, setPushSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [habitTimes, setHabitTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      habits.map((habit) => [habit.id, habit.reminder_time?.slice(0, 5) ?? ""]),
    ),
  );

  const locationLabel = useMemo(
    () => location
      ? `${location.timezone} · ${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
      : "Location is required for prayer times",
    [location],
  );
  const preferencesMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("/preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.user.profile }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.habits }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.prayerRoot }),
      ]);
      toast.success("Preferences and future reminders were updated.");
    },
    onError: (reason) => {
      toast.error(reason instanceof Error ? reason.message : "Preferences could not be saved.");
    },
  });
  const reminderMutation = useMutation({
    mutationFn: ({ habit, time }: {
      habit: HabitWithReminder;
      time: string;
    }) => apiRequest(`/habits/${habit.id}/reminder`, {
      method: "PUT",
      body: JSON.stringify(time
        ? { enabled: true, time }
        : { enabled: false, time: null }),
    }),
    onSuccess: async (_result, { habit, time }) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.user.habits,
      });
      toast.success(time ? `${habit.name} reminder saved.` : `${habit.name} reminder removed.`);
    },
    onError: (reason) => {
      toast.error(reason instanceof Error ? reason.message : "Habit reminder could not be saved.");
    },
  });

  function refreshLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser does not support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setLocating(false);
        toast.success("Prayer location refreshed.");
      },
      () => {
        setLocating(false);
        toast.error("Allow location access to enable prayer times.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  function savePreferences() {
    if (!goals.length) {
      toast.error("Choose at least one goal.");
      return;
    }
    if (religion === "muslim" && !location) {
      toast.error("Location is required for prayer times.");
      return;
    }
    preferencesMutation.mutate({
      goals,
      pace,
      religion,
      dailyDigestTime: digestTime,
      dailyDigestEnabled: digestEnabled,
      prayerSetup: religion === "muslim" && location
        ? {
            ...location,
            madhab,
            calculationMethod: method,
            reminders: prayerReminders.map((setting) => ({
              prayer: setting.prayer_name,
              enabled: setting.enabled,
              offsetMinutes: setting.offset_minutes,
            })),
          }
        : null,
    });
  }

  async function togglePush() {
    setPushSaving(true);
    if (pushState === "enabled") {
      await unregisterPushNotifications();
      setPushState("prompt");
      toast.success("Push notifications were disabled for this browser.");
    } else {
      const next = await enablePushNotifications().catch(() => "unconfigured" as const);
      setPushState(next);
      if (next === "enabled") toast.success("Push notifications are enabled.");
      else toast.error("Push notifications could not be enabled in this browser.");
    }
    setPushSaving(false);
  }

  function saveHabitReminder(habit: HabitWithReminder) {
    const time = habitTimes[habit.id] ?? "";
    if (!reminderMutation.isPending) {
      reminderMutation.mutate({ habit, time });
    }
  }

  return (
    <section className="settings-panel" id="settings" aria-labelledby="settings-title">
      <div className="honest-section-title">
        <div><p>PREFERENCES</p><h2 id="settings-title">Settings</h2></div>
        <Settings2 size={20} />
      </div>

      <div className="settings-grid">
        <article>
          <h3>Goals and pace</h3>
          <div className="settings-chip-list">
            {allGoals.map((goal) => (
              <button
                type="button"
                className={goals.includes(goal) ? "selected" : ""}
                onClick={() => setGoals((current) =>
                  current.includes(goal)
                    ? current.filter((item) => item !== goal)
                    : [...current, goal]
                )}
                key={goal}
              >
                {goals.includes(goal) && <Check size={12} />} {titleCase(goal)}
              </button>
            ))}
          </div>
          <label>Starting pace
            <select value={pace} onChange={(event) => setPace(event.target.value as typeof pace)}>
              <option value="light">Light</option>
              <option value="balanced">Balanced</option>
              <option value="ambitious">Ambitious</option>
            </select>
          </label>
        </article>

        <article>
          <h3>Digest and push</h3>
          <label className="settings-toggle">
            <input type="checkbox" checked={digestEnabled} onChange={(event) => setDigestEnabled(event.target.checked)} />
            Daily incomplete-habits digest
          </label>
          <Input type="time" disabled={!digestEnabled} value={digestTime} onChange={(event) => setDigestTime(event.target.value)} />
          <button type="button" className="settings-push" disabled={pushSaving} onClick={() => void togglePush()}>
            {pushState === "enabled" ? <BellOff /> : <Bell />}
            <span>
              <strong>{pushState === "enabled" ? "Disable push on this browser" : "Enable Firebase push"}</strong>
              <small>Current state: {pushState}</small>
            </span>
          </button>
        </article>

        <article className="settings-wide">
          <h3>Religion and prayer</h3>
          <label>Religion preference
            <select
              value={religion}
              onChange={(event) => {
                const next = event.target.value as ReligionPreference;
                setReligion(next);
                if (next !== "muslim") setLocation(null);
              }}
            >
              <option value="muslim">Muslim</option>
              <option value="other">Other</option>
              <option value="unspecified">Prefer not to say</option>
            </select>
          </label>
          {religion === "muslim" && (
            <>
              <button type="button" className="settings-location" disabled={locating} onClick={refreshLocation}>
                {locating ? <LoaderCircle className="spin" /> : location ? <Crosshair /> : <MapPin />}
                <span><strong>{location ? "Refresh prayer location" : "Set prayer location"}</strong><small>{locationLabel}</small></span>
              </button>
              <div className="settings-form-row">
                <label>Mazhab
                  <select value={madhab} onChange={(event) => setMadhab(event.target.value as Madhab)}>
                    <option value="hanafi">Hanafi</option>
                    <option value="shafi">Shafi</option>
                    <option value="maliki">Maliki</option>
                    <option value="hanbali">Hanbali</option>
                  </select>
                </label>
                <label>Calculation method
                  <select value={method} onChange={(event) => setMethod(event.target.value)}>
                    {methods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <div className="settings-prayers">
                {prayerReminders.map((setting, index) => (
                  <div key={setting.prayer_name}>
                    <label>
                      <input
                        type="checkbox"
                        checked={setting.enabled}
                        onChange={(event) => setPrayerReminders((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, enabled: event.target.checked } : item
                          )
                        )}
                      />
                      {titleCase(setting.prayer_name)}
                    </label>
                    <select
                      disabled={!setting.enabled}
                      value={setting.offset_minutes}
                      onChange={(event) => setPrayerReminders((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, offset_minutes: Number(event.target.value) }
                            : item
                        )
                      )}
                    >
                      <option value={0}>At prayer time</option>
                      <option value={5}>5 min before</option>
                      <option value={10}>10 min before</option>
                      <option value={15}>15 min before</option>
                      <option value={30}>30 min before</option>
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="settings-wide">
          <h3>Per-habit reminders</h3>
          <p className="settings-help">Leave a time empty to disable that habit’s separate reminder.</p>
          <div className="habit-reminder-list">
            {habits.map((habit) => (
              <div key={habit.id}>
                <span>{habit.icon}</span>
                <strong>{habit.name}</strong>
                <Input
                  type="time"
                  value={habitTimes[habit.id] ?? ""}
                  onChange={(event) => setHabitTimes((current) => ({
                    ...current,
                    [habit.id]: event.target.value,
                  }))}
                />
                <Button
                  variant="secondary"
                  disabled={reminderMutation.isPending
                    && reminderMutation.variables?.habit.id === habit.id}
                  onClick={() => saveHabitReminder(habit)}
                >
                  {reminderMutation.isPending
                    && reminderMutation.variables?.habit.id === habit.id
                    ? <LoaderCircle className="spin" />
                    : <Save />}
                  Save
                </Button>
              </div>
            ))}
          </div>
        </article>
      </div>

      <footer className="settings-save">
        <Button disabled={preferencesMutation.isPending} onClick={savePreferences}>
          {preferencesMutation.isPending ? <LoaderCircle className="spin" /> : <Save />}
          Save preferences
        </Button>
      </footer>
    </section>
  );
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}
