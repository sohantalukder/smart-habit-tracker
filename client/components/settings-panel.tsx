"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Check,
  CircleAlert,
  Clock3,
  Crosshair,
  LoaderCircle,
  MapPin,
  MoonStar,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
import {
  composePreferencesPayload,
  habitReminderRequest,
  parseSettingsSection,
  settingsSections,
  type PreferencesPayload,
  type SettingsSection,
} from "@/lib/settings";

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
const sectionTabs = [
  {
    id: "preferences",
    label: "Preferences",
    description: "Goals and pace",
    icon: SlidersHorizontal,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Digest, push, and reminders",
    icon: Bell,
  },
  {
    id: "prayer",
    label: "Prayer",
    description: "Religion and prayer setup",
    icon: MoonStar,
  },
] as const;

type ReminderSaveState = {
  state: "saving" | "saved" | "error";
  attemptedTime: string;
  message?: string;
};

export function SettingsPanel({
  profile,
  habits,
}: {
  profile: ExperienceProfile;
  habits: HabitWithReminder[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = parseSettingsSection(searchParams.get("section"));
  const initialPreferences = useMemo(
    () => preferencesFromProfile(profile),
    [profile],
  );
  const [confirmedPreferences, setConfirmedPreferences] =
    useState<PreferencesPayload>(initialPreferences);
  const [goals, setGoals] = useState<GoalPreference[]>(
    initialPreferences.goals,
  );
  const [pace, setPace] = useState(initialPreferences.pace);
  const [religion, setReligion] = useState<ReligionPreference>(
    initialPreferences.religion,
  );
  const [digestTime, setDigestTime] = useState(
    initialPreferences.dailyDigestTime,
  );
  const [digestEnabled, setDigestEnabled] = useState(
    initialPreferences.dailyDigestEnabled,
  );
  const [location, setLocation] = useState(() => (
    initialPreferences.prayerSetup
      ? {
          latitude: initialPreferences.prayerSetup.latitude,
          longitude: initialPreferences.prayerSetup.longitude,
          timezone: initialPreferences.prayerSetup.timezone,
        }
      : null
  ));
  const [madhab, setMadhab] = useState<Madhab>(
    initialPreferences.prayerSetup?.madhab ?? "hanafi",
  );
  const [method, setMethod] = useState<string>(
    initialPreferences.prayerSetup?.calculationMethod ?? "karachi",
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
  const [reminderStates, setReminderStates] =
    useState<Record<string, ReminderSaveState>>({});
  const pendingHabitIds = useRef(new Set<string>());

  const locationLabel = useMemo(
    () => location
      ? `${location.timezone} · ${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
      : "Location is required for prayer times",
    [location],
  );

  const preferencesMutation = useMutation({
    mutationFn: ({
      payload,
    }: {
      section: SettingsSection;
      payload: PreferencesPayload;
    }) => apiRequest("/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
    onSuccess: async (_result, { section, payload }) => {
      setConfirmedPreferences(payload);
      if (section === "prayer" && payload.prayerSetup === null) {
        setLocation(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.user.profile }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.habits }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.prayerRoot }),
      ]);
      toast.success(`${sectionTitle(section)} settings were updated.`);
    },
    onError: (reason) => {
      toast.error(reason instanceof Error ? reason.message : "Preferences could not be saved.");
    },
  });

  const reminderMutation = useMutation({
    mutationFn: ({
      habit,
      time,
    }: {
      habit: HabitWithReminder;
      time: string;
    }) => apiRequest(`/habits/${habit.id}/reminder`, {
      method: "PUT",
      body: JSON.stringify(habitReminderRequest(time)),
    }),
  });

  function currentDraft(): PreferencesPayload {
    return {
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
    };
  }

  function saveSection(section: SettingsSection) {
    if (section === "preferences" && !goals.length) {
      toast.error("Choose at least one goal.");
      return;
    }
    if (section === "prayer" && religion === "muslim" && !location) {
      toast.error("Location is required for prayer times.");
      return;
    }
    preferencesMutation.mutate({
      section,
      payload: composePreferencesPayload(
        section,
        currentDraft(),
        confirmedPreferences,
      ),
    });
  }

  function selectSection(section: SettingsSection) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    section: SettingsSection,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const currentIndex = settingsSections.indexOf(section);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? settingsSections.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % settingsSections.length
          : (currentIndex - 1 + settingsSections.length) % settingsSections.length;
    const nextSection = settingsSections[nextIndex]!;
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    tabs?.[nextIndex]?.focus();
    selectSection(nextSection);
  }

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

  async function persistHabitReminder(
    habit: HabitWithReminder,
    time: string,
  ) {
    if (pendingHabitIds.current.has(habit.id)) return;
    pendingHabitIds.current.add(habit.id);
    setReminderStates((current) => ({
      ...current,
      [habit.id]: { state: "saving", attemptedTime: time },
    }));
    try {
      await reminderMutation.mutateAsync({ habit, time });
      setReminderStates((current) => ({
        ...current,
        [habit.id]: { state: "saved", attemptedTime: time },
      }));
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user.habits,
      });
    } catch (reason) {
      setReminderStates((current) => ({
        ...current,
        [habit.id]: {
          state: "error",
          attemptedTime: time,
          message: reason instanceof Error ? reason.message : "Reminder could not be saved.",
        },
      }));
    } finally {
      pendingHabitIds.current.delete(habit.id);
    }
  }

  return (
    <section className="settings-panel" id="settings" aria-label="Settings">
      <div className="settings-tabs" role="tablist" aria-label="Settings categories">
        {sectionTabs.map(({ id, label, description, icon: Icon }) => {
          const selected = activeSection === id;
          return (
            <button
              type="button"
              id={`${id}-tab`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "active" : ""}
              onClick={() => selectSection(id)}
              onKeyDown={(event) => handleTabKeyDown(event, id)}
              key={id}
            >
              <Icon aria-hidden="true" />
              <span>{label}<small>{description}</small></span>
            </button>
          );
        })}
      </div>

      {activeSection === "preferences" && (
        <div
          className="settings-section-card"
          id="preferences-panel"
          role="tabpanel"
          aria-labelledby="preferences-tab"
        >
          <header className="settings-section-heading">
            <div>
              <p>Personalize your plan</p>
              <h2>Preferences</h2>
              <span>Choose the areas you want to improve and a pace that feels sustainable.</span>
            </div>
            <SlidersHorizontal aria-hidden="true" />
          </header>

          <div className="settings-section-body">
            <fieldset className="settings-goals">
              <legend>Focus areas</legend>
              <p>Select one or more goals. You can change these whenever your priorities shift.</p>
              <div className="settings-chip-list">
                {allGoals.map((goal) => {
                  const selected = goals.includes(goal);
                  return (
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={selected ? "selected" : ""}
                      onClick={() => setGoals((current) =>
                        selected
                          ? current.filter((item) => item !== goal)
                          : [...current, goal]
                      )}
                      key={goal}
                    >
                      {selected && <Check aria-hidden="true" />} {titleCase(goal)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="settings-field">
              <span>Starting pace</span>
              <small>Controls how ambitious your recommended routine feels.</small>
              <select
                value={pace}
                onChange={(event) => setPace(event.target.value as typeof pace)}
              >
                <option value="light">Light</option>
                <option value="balanced">Balanced</option>
                <option value="ambitious">Ambitious</option>
              </select>
            </label>
          </div>

          <footer className="settings-section-actions">
            <Button
              disabled={preferencesMutation.isPending}
              onClick={() => saveSection("preferences")}
            >
              {preferencesMutation.isPending
                && preferencesMutation.variables?.section === "preferences"
                ? <LoaderCircle className="spin" />
                : <Save />}
              Save changes
            </Button>
          </footer>
        </div>
      )}

      {activeSection === "notifications" && (
        <div
          className="settings-section-card"
          id="notifications-panel"
          role="tabpanel"
          aria-labelledby="notifications-tab"
        >
          <header className="settings-section-heading">
            <div>
              <p>Stay gently accountable</p>
              <h2>Notifications</h2>
              <span>Control your daily digest, browser notifications, and habit reminder times.</span>
            </div>
            <Bell aria-hidden="true" />
          </header>

          <div className="settings-section-body">
            <div className="settings-notification-cards">
              <article className="settings-subcard">
                <div className="settings-subcard-heading">
                  <span><Clock3 aria-hidden="true" /></span>
                  <div><h3>Daily digest</h3><p>A summary of habits still waiting for you.</p></div>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={digestEnabled}
                    onChange={(event) => setDigestEnabled(event.target.checked)}
                  />
                  <span>Send my incomplete-habits digest</span>
                </label>
                <label className="settings-field settings-digest-time">
                  <span>Delivery time</span>
                  <Input
                    type="time"
                    disabled={!digestEnabled}
                    value={digestTime}
                    onChange={(event) => setDigestTime(event.target.value)}
                  />
                </label>
              </article>

              <article className="settings-subcard">
                <div className="settings-subcard-heading">
                  <span><Bell aria-hidden="true" /></span>
                  <div><h3>Browser push</h3><p>Receive reminders on this browser when Bloom is closed.</p></div>
                </div>
                <button
                  type="button"
                  className="settings-push"
                  disabled={pushSaving}
                  onClick={() => void togglePush()}
                >
                  {pushState === "enabled" ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
                  <span>
                    <strong>{pushState === "enabled" ? "Disable browser push" : "Enable browser push"}</strong>
                    <small>Current state: {pushState}</small>
                  </span>
                </button>
              </article>
            </div>

            <div className="habit-reminder-section">
              <header>
                <div>
                  <h3>Habit reminders</h3>
                  <p>Choose a time for each habit. Changes save automatically; clear a time to turn it off.</p>
                </div>
                <span><Check aria-hidden="true" /> Autosave on</span>
              </header>
              <div className="habit-reminder-list">
                {habits.map((habit) => {
                  const saveState = reminderStates[habit.id];
                  const time = habitTimes[habit.id] ?? "";
                  return (
                    <div className="habit-reminder-row" key={habit.id}>
                      <div className="habit-reminder-identity">
                        <span aria-hidden="true">{habit.icon}</span>
                        <div>
                          <strong>{habit.name}</strong>
                          <small>{time ? "Daily reminder" : "No reminder set"}</small>
                        </div>
                      </div>
                      <div className="habit-reminder-action">
                        <label className="habit-reminder-control">
                          <span className="sr-only">Reminder time for {habit.name}</span>
                          <Input
                            type="time"
                            aria-label={`Reminder time for ${habit.name}`}
                            disabled={saveState?.state === "saving"}
                            value={time}
                            onChange={(event) => {
                              const nextTime = event.target.value;
                              setHabitTimes((current) => ({
                                ...current,
                                [habit.id]: nextTime,
                              }));
                              void persistHabitReminder(habit, nextTime);
                            }}
                          />
                        </label>
                        <div
                          className={`habit-reminder-status is-${saveState?.state ?? "idle"}`}
                          aria-live="polite"
                        >
                          {saveState?.state === "saving" && (
                            <span><LoaderCircle className="spin" aria-hidden="true" /> Saving…</span>
                          )}
                          {saveState?.state === "saved" && (
                            <span><Check aria-hidden="true" /> Saved</span>
                          )}
                          {saveState?.state === "error" && (
                            <button
                              type="button"
                              title={saveState.message}
                              onClick={() => void persistHabitReminder(
                                habit,
                                saveState.attemptedTime,
                              )}
                            >
                              <CircleAlert aria-hidden="true" /> Couldn’t save · Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <footer className="settings-section-actions">
            <span>Habit reminder times save separately and automatically.</span>
            <Button
              disabled={preferencesMutation.isPending}
              onClick={() => saveSection("notifications")}
            >
              {preferencesMutation.isPending
                && preferencesMutation.variables?.section === "notifications"
                ? <LoaderCircle className="spin" />
                : <Save />}
              Save changes
            </Button>
          </footer>
        </div>
      )}

      {activeSection === "prayer" && (
        <div
          className="settings-section-card"
          id="prayer-panel"
          role="tabpanel"
          aria-labelledby="prayer-tab"
        >
          <header className="settings-section-heading">
            <div>
              <p>Keep faith in your routine</p>
              <h2>Prayer</h2>
              <span>Set your religion preference and personalize prayer calculation and reminders.</span>
            </div>
            <MoonStar aria-hidden="true" />
          </header>

          <div className="settings-section-body">
            <label className="settings-field settings-religion">
              <span>Religion preference</span>
              <small>Prayer features are shown only when Muslim is selected.</small>
              <select
                value={religion}
                onChange={(event) => setReligion(event.target.value as ReligionPreference)}
              >
                <option value="muslim">Muslim</option>
                <option value="other">Other</option>
                <option value="unspecified">Prefer not to say</option>
              </select>
            </label>

            {religion === "muslim" ? (
              <div className="settings-prayer-setup">
                <button
                  type="button"
                  className="settings-location"
                  disabled={locating}
                  onClick={refreshLocation}
                >
                  {locating
                    ? <LoaderCircle className="spin" aria-hidden="true" />
                    : location
                      ? <Crosshair aria-hidden="true" />
                      : <MapPin aria-hidden="true" />}
                  <span>
                    <strong>{location ? "Refresh prayer location" : "Set prayer location"}</strong>
                    <small>{locationLabel}</small>
                  </span>
                </button>

                <div className="settings-form-row">
                  <label className="settings-field">
                    <span>Mazhab</span>
                    <select
                      value={madhab}
                      onChange={(event) => setMadhab(event.target.value as Madhab)}
                    >
                      <option value="hanafi">Hanafi</option>
                      <option value="shafi">Shafi</option>
                      <option value="maliki">Maliki</option>
                      <option value="hanbali">Hanbali</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Calculation method</span>
                    <select value={method} onChange={(event) => setMethod(event.target.value)}>
                      {methods.map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset className="settings-prayers">
                  <legend>Prayer reminders</legend>
                  <p>Choose whether and when each prayer reminder should arrive.</p>
                  <div>
                    {prayerReminders.map((setting, index) => (
                      <div className="settings-prayer-row" key={setting.prayer_name}>
                        <label>
                          <input
                            type="checkbox"
                            checked={setting.enabled}
                            onChange={(event) => setPrayerReminders((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, enabled: event.target.checked }
                                  : item
                              )
                            )}
                          />
                          <span>{titleCase(setting.prayer_name)}</span>
                        </label>
                        <select
                          aria-label={`${titleCase(setting.prayer_name)} reminder time`}
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
                </fieldset>
              </div>
            ) : (
              <div className="settings-prayer-empty">
                <MoonStar aria-hidden="true" />
                <div>
                  <h3>Prayer settings are hidden</h3>
                  <p>Select Muslim above if you would like Bloom to calculate prayer times and send prayer reminders.</p>
                </div>
              </div>
            )}
          </div>

          <footer className="settings-section-actions">
            <Button
              disabled={preferencesMutation.isPending}
              onClick={() => saveSection("prayer")}
            >
              {preferencesMutation.isPending
                && preferencesMutation.variables?.section === "prayer"
                ? <LoaderCircle className="spin" />
                : <Save />}
              Save changes
            </Button>
          </footer>
        </div>
      )}
    </section>
  );
}

function preferencesFromProfile(profile: ExperienceProfile): PreferencesPayload {
  const religion = profile.religion_preference ?? "unspecified";
  const hasLocation = profile.latitude != null && profile.longitude != null;
  return {
    goals: profile.goal_preferences?.length
      ? profile.goal_preferences
      : ["movement"],
    pace: profile.starting_pace ?? "balanced",
    religion,
    dailyDigestTime: String(profile.daily_digest_time ?? "20:00").slice(0, 5),
    dailyDigestEnabled: profile.daily_digest_enabled ?? true,
    prayerSetup: religion === "muslim" && hasLocation
      ? {
          latitude: Number(profile.latitude),
          longitude: Number(profile.longitude),
          timezone: profile.timezone,
          madhab: profile.madhab ?? "hanafi",
          calculationMethod: profile.prayer_calculation_method ?? "karachi",
          reminders: prayerNames.map((prayer) => {
            const reminder = profile.prayer_reminders?.find(
              (setting) => setting.prayer_name === prayer,
            );
            return {
              prayer,
              enabled: reminder?.enabled ?? true,
              offsetMinutes: reminder?.offset_minutes ?? 0,
            };
          }),
        }
      : null,
  };
}

function sectionTitle(section: SettingsSection) {
  return section === "preferences"
    ? "Preference"
    : section === "notifications"
      ? "Notification"
      : "Prayer";
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}
