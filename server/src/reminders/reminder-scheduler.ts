import type { Pool } from "pg";
import {
  PrayerTimeService,
  addLocalDays,
  localDateInTimezone,
  type PrayerCalculationInput,
} from "../prayer/prayer-time.service";

type Queryable = Pick<Pool, "query">;

type ReminderProfile = {
  id: string;
  timezone: string;
  daily_digest_time: string;
  daily_digest_enabled: boolean;
  religion_preference: string;
  prayer_enabled: boolean;
  latitude: number | string | null;
  longitude: number | string | null;
  madhab: string | null;
  prayer_calculation_method: string | null;
};

type HabitReminderRow = {
  habit_id: string;
  name: string;
  time_local: string;
  frequency: unknown;
};

type PrayerReminderRow = {
  prayer_name: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
  offset_minutes: number;
};

export type MaterializedDelivery = {
  id: string;
  scheduled_at: Date;
};

const prayerTimes = new PrayerTimeService();

export async function materializeReminders(
  database: Queryable,
  userId?: string,
  now = new Date(),
) {
  const profiles = await database.query<ReminderProfile>(
    `select id, timezone,
            to_char(daily_digest_time, 'HH24:MI') as daily_digest_time,
            daily_digest_enabled, religion_preference, prayer_enabled,
            latitude, longitude, madhab, prayer_calculation_method
     from profiles
     where onboarding_completed_at is not null
       and suspended_at is null
       and deleted_at is null
       and ($1::uuid is null or id = $1::uuid)`,
    [userId ?? null],
  );
  const deliveries: MaterializedDelivery[] = [];
  for (const profile of profiles.rows) {
    deliveries.push(...await materializeForProfile(database, profile, now));
  }
  return deliveries;
}

async function materializeForProfile(
  database: Queryable,
  profile: ReminderProfile,
  now: Date,
) {
  const [habitResult, prayerResult] = await Promise.all([
    database.query<HabitReminderRow>(
      `select h.id as habit_id, h.name,
              to_char(r.time_local, 'HH24:MI') as time_local,
              h.frequency
       from habit_reminders r
       join habits h on h.id = r.habit_id
       where r.user_id = $1
         and r.enabled = true
         and h.state = 'active'
         and h.deleted_at is null`,
      [profile.id],
    ),
    database.query<PrayerReminderRow>(
      `select prayer_name, offset_minutes
       from prayer_reminder_settings
       where user_id = $1 and enabled = true`,
      [profile.id],
    ),
  ]);
  const localToday = localDateInTimezone(now, profile.timezone);
  const deliveries: MaterializedDelivery[] = [];

  for (let day = 0; day < 7; day += 1) {
    const localDate = addLocalDays(localToday, day);
    if (profile.daily_digest_enabled) {
      const scheduledAt = zonedLocalDateTimeToDate(
        localDate,
        profile.daily_digest_time,
        profile.timezone,
      );
      const inserted = await insertDelivery(database, {
        userId: profile.id,
        title: "Your Bloom check-in",
        body: "A few promises may still need your attention.",
        scheduledAt,
        sourceType: "daily_digest",
        sourceKey: `daily-digest:${localDate}`,
        metadata: { localDate, url: "/#today" },
        now,
      });
      if (inserted) deliveries.push(inserted);
    }

    for (const reminder of habitResult.rows) {
      if (!isHabitScheduledOnDate(reminder.frequency, localDate)) continue;
      const scheduledAt = zonedLocalDateTimeToDate(
        localDate,
        reminder.time_local,
        profile.timezone,
      );
      const inserted = await insertDelivery(database, {
        userId: profile.id,
        habitId: reminder.habit_id,
        title: `Time for ${reminder.name}`,
        body: "A small, honest step is ready when you are.",
        scheduledAt,
        sourceType: "habit",
        sourceKey: `habit:${reminder.habit_id}:${localDate}`,
        metadata: {
          habitId: reminder.habit_id,
          localDate,
          url: "/#today",
        },
        now,
      });
      if (inserted) deliveries.push(inserted);
    }

    if (isPrayerProfile(profile)) {
      const prayers = await prayerTimes.calculate(localDate, prayerInput(profile));
      for (const reminder of prayerResult.rows) {
        const prayer = prayers.find((item) => item.name === reminder.prayer_name);
        if (!prayer) continue;
        const scheduledAt = new Date(
          new Date(prayer.time).getTime() - reminder.offset_minutes * 60_000,
        );
        const label = titleCase(prayer.name);
        const inserted = await insertDelivery(database, {
          userId: profile.id,
          title: `${label} prayer`,
          body: reminder.offset_minutes
            ? `${label} begins in ${reminder.offset_minutes} minutes.`
            : `It is time for ${label}.`,
          scheduledAt,
          sourceType: "prayer",
          sourceKey: `prayer:${localDate}:${prayer.name}`,
          metadata: {
            prayer: prayer.name,
            localDate,
            offsetMinutes: reminder.offset_minutes,
            url: "/#prayers",
          },
          now,
        });
        if (inserted) deliveries.push(inserted);
      }
    }
  }
  return deliveries;
}

async function insertDelivery(
  database: Queryable,
  input: {
    userId: string;
    habitId?: string;
    title: string;
    body: string;
    scheduledAt: Date;
    sourceType: string;
    sourceKey: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  if (input.scheduledAt <= input.now) return null;
  const result = await database.query<MaterializedDelivery>(
    `insert into notification_deliveries (
       user_id, habit_id, channel, title, body, scheduled_at,
       source_type, source_key, metadata
     )
     values ($1, $2, 'push', $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (user_id, channel, source_key)
       where source_key is not null
     do update
     set habit_id = excluded.habit_id,
         title = excluded.title,
         body = excluded.body,
         scheduled_at = excluded.scheduled_at,
         source_type = excluded.source_type,
         metadata = excluded.metadata,
         state = 'scheduled',
         sent_at = null,
         error_message = null
     where notification_deliveries.state in ('scheduled', 'cancelled', 'failed')
     returning id, scheduled_at`,
    [
      input.userId,
      input.habitId ?? null,
      input.title,
      input.body,
      input.scheduledAt,
      input.sourceType,
      input.sourceKey,
      JSON.stringify(input.metadata),
    ],
  );
  return result.rows[0] ?? null;
}

export function zonedLocalDateTimeToDate(
  localDate: string,
  localTime: string,
  timezone: string,
) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.slice(0, 5).split(":").map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      values.year!,
      values.month! - 1,
      values.day!,
      values.hour!,
      values.minute!,
      values.second!,
    );
    const difference = represented - desired;
    if (difference === 0) break;
    candidate -= difference;
  }
  return new Date(candidate);
}

export function isHabitScheduledOnDate(frequency: unknown, localDate: string) {
  if (
    !frequency
    || typeof frequency !== "object"
    || !("kind" in frequency)
    || frequency.kind !== "weekdays"
  ) {
    return true;
  }
  if (!("days" in frequency) || !Array.isArray(frequency.days)) return false;
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return frequency.days.includes(day);
}

function isPrayerProfile(profile: ReminderProfile) {
  return (
    profile.religion_preference === "muslim"
    && profile.prayer_enabled
    && profile.latitude != null
    && profile.longitude != null
    && Boolean(profile.madhab)
    && Boolean(profile.prayer_calculation_method)
  );
}

function prayerInput(profile: ReminderProfile) {
  return {
    latitude: Number(profile.latitude),
    longitude: Number(profile.longitude),
    timezone: profile.timezone,
    madhab: profile.madhab,
    calculationMethod: profile.prayer_calculation_method,
  } as PrayerCalculationInput;
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
