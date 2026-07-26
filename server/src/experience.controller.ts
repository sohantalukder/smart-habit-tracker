import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "./auth/auth.guard";
import {
  firebaseInstallationSchema,
  habitReminderSchema,
  onboardingSchema,
  prayerCheckInSchema,
  prayerNameSchema,
  preferencesSchema,
  recommendationSchema,
  type OnboardingInput,
  type PrayerSetupInput,
  type PreferencesInput,
} from "./contracts";
import type { DatabaseClient } from "./platform/database.service";
import { DatabaseService } from "./platform/database.service";
import { QueueService } from "./platform/queue.service";
import {
  PrayerTimeService,
  type PrayerCalculationInput,
} from "./prayer/prayer-time.service";

type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  habit_type: string;
  icon: string;
  default_target: number | null;
  default_unit: string | null;
  default_frequency: unknown;
  goal_tags: string[];
  recommendation_priority: number;
};

@Controller()
export class ExperienceController {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService,
    private readonly prayerTimes: PrayerTimeService,
  ) {}

  @Post("habit-recommendations")
  async recommendations(@Body() input: unknown) {
    const parsed = recommendationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const templates = await this.database.query<TemplateRow>(
      `select id, slug, name, description, category, habit_type, icon,
              default_target::float8 as default_target, default_unit,
              default_frequency, goal_tags, recommendation_priority
       from habit_templates
       where active = true and goal_tags && $1::text[]
       order by recommendation_priority, slug`,
      [parsed.data.goals],
    );
    return rankHabitRecommendations(
      templates.rows,
      parsed.data.goals,
      parsed.data.pace,
    );
  }

  @Post("onboarding")
  async onboarding(
    @Req() request: AuthenticatedRequest,
    @Body() input: OnboardingInput,
  ) {
    const parsed = onboardingSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const value = parsed.data;
    await this.database.transaction(async (client) => {
      const selected = await client.query<{ id: string }>(
        `select id
         from habit_templates
         where id = any($1::uuid[])
           and active = true
           and goal_tags && $2::text[]`,
        [value.templateIds, value.goals],
      );
      if (selected.rowCount !== value.templateIds.length) {
        throw new BadRequestException(
          "Every selected habit must be an active recommendation for your goals.",
        );
      }

      await applyPreferences(client, request.user.id, value);
      await client.query(
        `update profiles
         set name = $2,
             units = $3,
             onboarding_completed_at = coalesce(onboarding_completed_at, now()),
             updated_at = now()
         where id = $1`,
        [request.user.id, value.name.trim(), value.units],
      );
      await client.query(
        `insert into habits (
           user_id, template_id, name, icon, category, habit_type,
           target, unit, frequency
         )
         select $1, t.id, t.name, t.icon, t.category, t.habit_type,
                t.default_target, t.default_unit, t.default_frequency
         from habit_templates t
         where t.id = any($2::uuid[])
         on conflict (user_id, template_id)
           where template_id is not null and deleted_at is null
         do nothing`,
        [request.user.id, value.templateIds],
      );
    });
    await this.refreshReminders(request.user.id);
    return { completed: true };
  }

  @Put("preferences")
  async preferences(
    @Req() request: AuthenticatedRequest,
    @Body() input: PreferencesInput,
  ) {
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.database.transaction(async (client) => {
      await applyPreferences(client, request.user.id, parsed.data);
      await cancelUserReminders(client, request.user.id, [
        "prayer",
        "habit",
        "daily_digest",
      ]);
    });
    await this.refreshReminders(request.user.id);
    return { updated: true };
  }

  @Get("prayer-times")
  async prayerSchedule(
    @Req() request: AuthenticatedRequest,
    @Query("date") date: string | undefined,
  ) {
    const profile = await this.prayerProfile(request.user.id);
    const localDate = date ?? localDateForProfile(profile.timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      throw new BadRequestException("Date must use YYYY-MM-DD.");
    }
    const calculated = await this.prayerTimes.withNextPrayer(
      localDate,
      prayerInput(profile),
    );
    const logs = await this.database.query<{
      prayer_name: string;
      status: string;
      updated_at: Date;
    }>(
      `select prayer_name, status, updated_at
       from prayer_logs
       where user_id = $1 and local_date = $2::date`,
      [request.user.id, localDate],
    );
    const statusByPrayer = new Map(
      logs.rows.map((log) => [log.prayer_name, log]),
    );
    return {
      date: localDate,
      timezone: profile.timezone,
      madhab: profile.madhab,
      calculationMethod: profile.prayer_calculation_method,
      prayers: calculated.prayers.map((prayer) => ({
        ...prayer,
        status: statusByPrayer.get(prayer.name)?.status ?? null,
      })),
      nextPrayer: calculated.nextPrayer,
    };
  }

  @Put("prayers/:prayer/logs/:localDate")
  async prayerCheckIn(
    @Req() request: AuthenticatedRequest,
    @Param("prayer") rawPrayer: string,
    @Param("localDate") localDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: unknown,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency-Key header is required.");
    }
    const prayer = prayerNameSchema.safeParse(rawPrayer);
    const value = prayerCheckInSchema.safeParse(input);
    if (!prayer.success || !value.success || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      throw new BadRequestException("Prayer check-in is invalid.");
    }
    await this.prayerProfile(request.user.id);
    const result = await this.database.query(
      `insert into prayer_logs (
         user_id, local_date, prayer_name, status, idempotency_key
       )
       values ($1, $2::date, $3, $4, $5)
       on conflict (user_id, local_date, prayer_name) do update
       set status = excluded.status,
           updated_at = now()
       returning id, user_id, local_date, prayer_name, status,
                 created_at, updated_at`,
      [
        request.user.id,
        localDate,
        prayer.data,
        value.data.status,
        idempotencyKey,
      ],
    );
    return result.rows[0];
  }

  @Put("habits/:id/reminder")
  async habitReminder(
    @Req() request: AuthenticatedRequest,
    @Param("id") habitId: string,
    @Body() input: unknown,
  ) {
    const parsed = habitReminderSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const habit = await this.database.query<{ id: string }>(
      `select id from habits
       where id = $1 and user_id = $2 and deleted_at is null`,
      [habitId, request.user.id],
    );
    if (!habit.rows[0]) throw new BadRequestException("Habit not found.");
    if (!parsed.data.enabled) {
      await this.database.query(
        "delete from habit_reminders where habit_id = $1 and user_id = $2",
        [habitId, request.user.id],
      );
    } else {
      await this.database.query(
        `insert into habit_reminders (habit_id, user_id, enabled, time_local)
         values ($1, $2, true, $3::time)
         on conflict (habit_id) do update
         set enabled = true, time_local = excluded.time_local, updated_at = now()`,
        [habitId, request.user.id, parsed.data.time],
      );
    }
    await this.database.query(
      `update notification_deliveries
       set state = 'cancelled'
       where user_id = $1
         and source_type = 'habit'
         and metadata->>'habitId' = $2
         and state = 'scheduled'`,
      [request.user.id, habitId],
    );
    await this.refreshReminders(request.user.id);
    return parsed.data.enabled
      ? { enabled: true, time: parsed.data.time }
      : { enabled: false, time: null };
  }

  @Post("push/installations")
  async registerInstallation(
    @Req() request: AuthenticatedRequest,
    @Body() input: unknown,
  ) {
    const parsed = firebaseInstallationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.database.query(
      `insert into firebase_installations (
         user_id, installation_id, platform, active
       )
       values ($1, $2, $3, true)
       on conflict (installation_id) do update
       set user_id = excluded.user_id,
           platform = excluded.platform,
           active = true,
           last_seen_at = now(),
           updated_at = now()`,
      [request.user.id, parsed.data.installationId, parsed.data.platform],
    );
    return { registered: true };
  }

  @Delete("push/installations/:installationId")
  async unregisterInstallation(
    @Req() request: AuthenticatedRequest,
    @Param("installationId") installationId: string,
  ) {
    await this.database.query(
      `update firebase_installations
       set active = false, updated_at = now()
       where user_id = $1 and installation_id = $2`,
      [request.user.id, installationId],
    );
    return { unregistered: true };
  }

  private async prayerProfile(userId: string) {
    const result = await this.database.query<{
      religion_preference: string;
      prayer_enabled: boolean;
      latitude: number | string | null;
      longitude: number | string | null;
      timezone: string;
      madhab: string | null;
      prayer_calculation_method: string | null;
    }>(
      `select religion_preference, prayer_enabled, latitude, longitude,
              timezone, madhab, prayer_calculation_method
       from profiles where id = $1`,
      [userId],
    );
    const profile = result.rows[0];
    if (
      !profile
      || profile.religion_preference !== "muslim"
      || !profile.prayer_enabled
      || profile.latitude == null
      || profile.longitude == null
      || !profile.madhab
      || !profile.prayer_calculation_method
    ) {
      throw new BadRequestException("Prayer setup is required.");
    }
    return profile;
  }

  private refreshReminders(userId: string) {
    return this.queue.add(
      "reminders.refresh",
      { userId },
      `reminders-refresh-${userId}-${Date.now()}`,
    );
  }
}

export function rankHabitRecommendations(
  templates: TemplateRow[],
  goals: string[],
  pace: "light" | "balanced" | "ambitious",
) {
  const maximum = pace === "light" ? 2 : pace === "balanced" ? 4 : 6;
  const remaining = [...templates];
  const ranked: TemplateRow[] = [];
  while (ranked.length < maximum && remaining.length) {
    let selectedInRound = false;
    for (const goal of goals) {
      const index = remaining.findIndex((template) =>
        template.goal_tags.includes(goal)
      );
      if (index >= 0) {
        ranked.push(remaining.splice(index, 1)[0]!);
        selectedInRound = true;
      }
      if (ranked.length === maximum) break;
    }
    if (!selectedInRound) break;
  }
  return ranked;
}

async function applyPreferences(
  client: DatabaseClient,
  userId: string,
  value: PreferencesInput | OnboardingInput,
) {
  const setup = value.religion === "muslim" ? value.prayerSetup : null;
  await client.query(
    `update profiles
     set goal_preferences = $2::text[],
         starting_pace = $3,
         religion_preference = $4,
         faith_preference = case when $4 = 'muslim' then 'muslim' else 'none' end,
         daily_digest_time = $5::time,
         daily_digest_enabled = $6,
         prayer_enabled = $4 = 'muslim',
         latitude = $7,
         longitude = $8,
         location_updated_at = case when $7::numeric is null then null else now() end,
         timezone = coalesce($9, timezone),
         madhab = $10,
         prayer_calculation_method = $11,
         updated_at = now()
     where id = $1`,
    [
      userId,
      value.goals,
      value.pace,
      value.religion,
      value.dailyDigestTime,
      value.dailyDigestEnabled,
      setup ? roundCoordinate(setup.latitude) : null,
      setup ? roundCoordinate(setup.longitude) : null,
      setup?.timezone ?? null,
      setup?.madhab ?? null,
      setup?.calculationMethod ?? null,
    ],
  );
  if (!setup) {
    await client.query(
      "delete from prayer_reminder_settings where user_id = $1",
      [userId],
    );
    await cancelUserReminders(client, userId, ["prayer"]);
    return;
  }
  await savePrayerReminders(client, userId, setup);
}

async function savePrayerReminders(
  client: DatabaseClient,
  userId: string,
  setup: PrayerSetupInput,
) {
  for (const reminder of setup.reminders) {
    await client.query(
      `insert into prayer_reminder_settings (
         user_id, prayer_name, enabled, offset_minutes
       )
       values ($1, $2, $3, $4)
       on conflict (user_id, prayer_name) do update
       set enabled = excluded.enabled,
           offset_minutes = excluded.offset_minutes,
           updated_at = now()`,
      [userId, reminder.prayer, reminder.enabled, reminder.offsetMinutes],
    );
  }
}

async function cancelUserReminders(
  client: DatabaseClient,
  userId: string,
  sourceTypes: string[],
) {
  await client.query(
    `update notification_deliveries
     set state = 'cancelled'
     where user_id = $1
       and source_type = any($2::text[])
       and state = 'scheduled'`,
    [userId, sourceTypes],
  );
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}

function prayerInput(profile: {
  latitude: number | string | null;
  longitude: number | string | null;
  timezone: string;
  madhab: string | null;
  prayer_calculation_method: string | null;
}) {
  return {
    latitude: Number(profile.latitude),
    longitude: Number(profile.longitude),
    timezone: profile.timezone,
    madhab: profile.madhab,
    calculationMethod: profile.prayer_calculation_method,
  } as PrayerCalculationInput;
}

function localDateForProfile(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
