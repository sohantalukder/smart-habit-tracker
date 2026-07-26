"use client";

import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Leaf,
  LoaderCircle,
  MapPin,
  Sparkles,
  Sprout,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import type { HabitTemplate } from "@/lib/api/types";
import {
  enablePushNotifications,
  type PushRegistrationState,
} from "@/lib/firebase-messaging";
import {
  buildOnboardingPayload,
  onboardingStepCount,
} from "@/lib/onboarding";

type Goal = "movement" | "nutrition" | "learning" | "sleep" | "mindfulness";
type Pace = "light" | "balanced" | "ambitious";
type Religion = "muslim" | "other" | "unspecified";
type Madhab = "hanafi" | "shafi" | "maliki" | "hanbali";
type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

type PrayerReminder = {
  prayer: PrayerName;
  enabled: boolean;
  offsetMinutes: number;
};

type LocationState = {
  latitude: number;
  longitude: number;
  timezone: string;
};

const goals: Array<{ value: Goal; label: string; description: string }> = [
  { value: "movement", label: "Movement", description: "Strength, steps, and mobility" },
  { value: "nutrition", label: "Nutrition", description: "Food and hydration choices" },
  { value: "learning", label: "Learning", description: "Reading and useful skills" },
  { value: "sleep", label: "Sleep", description: "Rest and a steady wind-down" },
  { value: "mindfulness", label: "Mindfulness", description: "Reflection and calm attention" },
];

const prayerNames: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const defaultReminders: PrayerReminder[] = prayerNames.map((prayer) => ({
  prayer,
  enabled: true,
  offsetMinutes: 0,
}));

const calculationMethods = [
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

export function OnboardingFlow({ initialName }: { initialName: string }) {
  const [step, setStep] = useState(1);
  const [name] = useState(initialName);
  const [selectedGoals, setSelectedGoals] = useState<Goal[]>(["movement", "sleep"]);
  const [pace, setPace] = useState<Pace>("balanced");
  const [religion, setReligion] = useState<Religion>("unspecified");
  const [digestTime, setDigestTime] = useState("20:00");
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [madhab, setMadhab] = useState<Madhab>("hanafi");
  const [calculationMethod, setCalculationMethod] = useState("karachi");
  const [reminders, setReminders] = useState(defaultReminders);
  const [templates, setTemplates] = useState<HabitTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [pushState, setPushState] = useState<PushRegistrationState>("prompt");

  const visibleSteps = onboardingStepCount(religion);
  const progress = completed ? 100 : Math.round((step / visibleSteps) * 100);

  useEffect(() => {
    if (step !== visibleSteps) return;
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<HabitTemplate[]>("/habit-recommendations", {
      method: "POST",
      body: JSON.stringify({ goals: selectedGoals, pace }),
    }).then((result) => {
      if (!active) return;
      setTemplates(result);
      setSelectedTemplates(new Set(
        result
          .map((template) => template.id)
          .filter((id): id is string => Boolean(id)),
      ));
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Suggestions could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [pace, selectedGoals, step, visibleSteps]);

  function toggleGoal(goal: Goal) {
    setSelectedGoals((current) =>
      current.includes(goal)
        ? current.filter((item) => item !== goal)
        : [...current, goal],
    );
  }

  function next() {
    setError("");
    if (step === 1 && !selectedGoals.length) {
      setError("Choose at least one area you want to support.");
      return;
    }
    if (religion === "muslim" && step === 3 && !location) {
      setError("Location is required to calculate accurate prayer times.");
      return;
    }
    setStep((current) => Math.min(visibleSteps, current + 1));
  }

  function back() {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  }

  function requestLocation() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location access.");
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
      },
      () => {
        setLocation(null);
        setLocationError("Location permission is required for Islamic prayer times. Allow it and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  async function finish() {
    if (!selectedTemplates.size) {
      setError("Keep at least one suggested habit to begin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest("/onboarding", {
        method: "POST",
        body: JSON.stringify(buildOnboardingPayload({
          name,
          goals: selectedGoals,
          pace,
          religion,
          dailyDigestTime: digestTime,
          location,
          madhab,
          calculationMethod,
          reminders,
          templateIds: [...selectedTemplates],
        })),
      });
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Onboarding could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function enablePush() {
    setLoading(true);
    const state = await enablePushNotifications((payload) => {
      toast(payload.data?.title ?? "A gentle reminder", {
        description: payload.data?.body,
      });
    }).catch(() => "unconfigured" as const);
    setPushState(state);
    setLoading(false);
    if (state === "enabled") {
      toast.success("Notifications are ready.");
      window.setTimeout(() => window.location.assign("/dashboard"), 500);
    }
  }

  if (completed) {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card onboarding-notification-step">
          <span className="onboarding-mark"><Bell size={26} /></span>
          <p>ONE LAST CHOICE</p>
          <h1>Let Bloom remind you at the moments you chose.</h1>
          <small>
            Notifications are optional and can be changed later. Prayer, digest,
            habit tracking, and your private dashboard still work if you decline.
          </small>
          {pushState === "denied" && (
            <div className="onboarding-error">Notifications are blocked in this browser. You can enable them later in browser settings.</div>
          )}
          {pushState === "unsupported" && (
            <div className="onboarding-error">This browser does not support Firebase web notifications.</div>
          )}
          {pushState === "unconfigured" && (
            <div className="onboarding-error">Firebase is not configured yet. Your account setup is complete.</div>
          )}
          <div className="onboarding-actions">
            <Button variant="ghost" onClick={() => window.location.assign("/dashboard")}>Not now</Button>
            <Button disabled={loading} onClick={() => void enablePush()}>
              {loading ? <LoaderCircle className="spin" /> : <Bell />}
              Enable notifications
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <header className="onboarding-header">
          <a href="/" className="bloom-brand"><span><Sprout size={20} /></span><strong>Bloom</strong></a>
          <span>STEP {step} OF {visibleSteps}</span>
        </header>
        <div className="onboarding-progress"><i style={{ width: `${progress}%` }} /></div>

        {step === 1 && (
          <div className="onboarding-stage">
            <p>YOUR DIRECTION</p>
            <h1>What deserves more room in your life?</h1>
            <small>Choose one or more areas. Bloom will suggest a balanced place to start.</small>
            <div className="onboarding-choice-grid">
              {goals.map((goal) => {
                const selected = selectedGoals.includes(goal.value);
                return (
                  <button
                    type="button"
                    className={selected ? "selected" : ""}
                    onClick={() => toggleGoal(goal.value)}
                    key={goal.value}
                  >
                    <span>{selected ? <Check /> : <Leaf />}</span>
                    <strong>{goal.label}</strong>
                    <small>{goal.description}</small>
                  </button>
                );
              })}
            </div>
            <fieldset className="onboarding-segmented">
              <legend>Starting pace</legend>
              {(["light", "balanced", "ambitious"] as Pace[]).map((value) => (
                <button
                  type="button"
                  className={pace === value ? "selected" : ""}
                  onClick={() => setPace(value)}
                  key={value}
                >
                  {value}
                </button>
              ))}
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-stage">
            <p>PERSONAL RHYTHM</p>
            <h1>Shape Bloom around your day.</h1>
            <small>Religion is collected only to decide whether prayer features should appear.</small>
            <fieldset className="onboarding-radio-list">
              <legend>Religion preference</legend>
              {([
                ["muslim", "Muslim", "Enable prayer times and prayer reminders"],
                ["other", "Other", "Keep the experience focused on general habits"],
                ["unspecified", "Prefer not to say", "Do not store a religion"],
              ] as const).map(([value, label, description]) => (
                <button
                  type="button"
                  className={religion === value ? "selected" : ""}
                  onClick={() => setReligion(value)}
                  key={value}
                >
                  <span>{religion === value && <Check />}</span>
                  <div><strong>{label}</strong><small>{description}</small></div>
                </button>
              ))}
            </fieldset>
            <label className="onboarding-time">
              Daily incomplete-habits digest
              <Input type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} />
              <small>Bloom skips this message when every scheduled habit is complete.</small>
            </label>
          </div>
        )}

        {religion === "muslim" && step === 3 && (
          <div className="onboarding-stage">
            <p>PRAYER SETUP</p>
            <h1>Calculate prayer times where you are.</h1>
            <small>Your browser location is rounded before storage and used only for prayer calculations.</small>
            <button type="button" className="onboarding-location" onClick={requestLocation} disabled={locating}>
              <span>{locating ? <LoaderCircle className="spin" /> : location ? <Crosshair /> : <MapPin />}</span>
              <div>
                <strong>{location ? "Location captured" : "Use my current location"}</strong>
                <small>{location ? `${location.timezone} · coordinates stored at reduced precision` : "Required to continue"}</small>
              </div>
            </button>
            {locationError && <div className="onboarding-error">{locationError}</div>}
            <div className="onboarding-form-grid">
              <label>Mazhab
                <select value={madhab} onChange={(event) => setMadhab(event.target.value as Madhab)}>
                  <option value="hanafi">Hanafi</option>
                  <option value="shafi">Shafi</option>
                  <option value="maliki">Maliki</option>
                  <option value="hanbali">Hanbali</option>
                </select>
              </label>
              <label>Calculation method
                <select value={calculationMethod} onChange={(event) => setCalculationMethod(event.target.value)}>
                  {calculationMethods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="prayer-reminder-setup">
              <legend>Prayer reminders</legend>
              {reminders.map((reminder, index) => (
                <div key={reminder.prayer}>
                  <label>
                    <input
                      type="checkbox"
                      checked={reminder.enabled}
                      onChange={(event) => setReminders((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, enabled: event.target.checked } : item
                        )
                      )}
                    />
                    {titleCase(reminder.prayer)}
                  </label>
                  <select
                    disabled={!reminder.enabled}
                    value={reminder.offsetMinutes}
                    onChange={(event) => setReminders((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, offsetMinutes: Number(event.target.value) }
                          : item
                      )
                    )}
                  >
                    <option value={0}>At prayer time</option>
                    <option value={5}>5 minutes before</option>
                    <option value={10}>10 minutes before</option>
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                  </select>
                </div>
              ))}
            </fieldset>
          </div>
        )}

        {step === visibleSteps && (
          <div className="onboarding-stage">
            <p>YOUR FIRST PRACTICE</p>
            <h1>Review your recommended starting habits.</h1>
            <small>These are selected from your goals and pace. Keep at least one; you can edit everything later.</small>
            {loading ? (
              <div className="onboarding-loading"><LoaderCircle className="spin" /> Finding a balanced start…</div>
            ) : (
              <div className="onboarding-template-list">
                {templates.map((template) => {
                  const id = template.id ?? "";
                  const selected = selectedTemplates.has(id);
                  return (
                    <button
                      type="button"
                      className={selected ? "selected" : ""}
                      onClick={() => setSelectedTemplates((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })}
                      key={id || template.name}
                    >
                      <span>{template.icon}</span>
                      <div><strong>{template.name}</strong><small>{template.description}</small></div>
                      <i>{selected && <Check />}</i>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <div className="onboarding-error" role="alert">{error}</div>}
        <footer className="onboarding-actions">
          <Button variant="ghost" disabled={step === 1 || loading} onClick={back}>
            <ChevronLeft /> Back
          </Button>
          {step === visibleSteps ? (
            <Button disabled={loading || !templates.length} onClick={() => void finish()}>
              {loading ? <LoaderCircle className="spin" /> : <Sparkles />}
              Create my habits
            </Button>
          ) : (
            <Button onClick={next}>Continue <ChevronRight /></Button>
          )}
        </footer>
      </section>
    </main>
  );
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
