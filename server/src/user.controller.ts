import {
  BadRequestException,
  Body,
  ConflictException,
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
import {
  checkInSchema,
  createHabitSchema,
  journalSchema,
  type CheckInInput,
  type CreateHabitInput,
  type JournalInput,
} from "./contracts";
import type { AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./platform/database.service";

@Controller()
export class UserController {
  constructor(private readonly database: DatabaseService) {}

  @Get("profile")
  async profile(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query(
      `select p.*, u.email,
              coalesce(
                (
                  select json_agg(
                    json_build_object(
                      'prayer_name', r.prayer_name,
                      'enabled', r.enabled,
                      'offset_minutes', r.offset_minutes
                    )
                    order by case r.prayer_name
                      when 'fajr' then 1 when 'dhuhr' then 2 when 'asr' then 3
                      when 'maghrib' then 4 else 5
                    end
                  )
                  from prayer_reminder_settings r
                  where r.user_id = p.id
                ),
                '[]'::json
              ) as prayer_reminders,
              exists (
                select 1 from firebase_installations f
                where f.user_id = p.id
                  and f.active = true
                  and f.last_seen_at >= now() - interval '30 days'
              ) as push_enabled
       from profiles p
       join users u on u.id = p.id
       where p.id = $1`,
      [request.user.id],
    );
    if (!result.rows[0]) throw new BadRequestException("Profile not found.");
    return result.rows[0];
  }

  @Get("habit-templates")
  async templates() {
    const result = await this.database.query(
      `select id, slug, name, description, category, habit_type, icon,
              default_target::float8 as default_target, default_unit,
              default_frequency, goal_tags, recommendation_priority,
              active, created_at, updated_at
       from habit_templates
       where active = true
       order by recommendation_priority, category, name`,
    );
    return result.rows;
  }

  @Get("habits")
  async habits(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query(
      `select id, user_id, template_id, name, icon, category, habit_type,
              target::float8 as target, unit, frequency, forgiving, state,
              deleted_at, created_at, updated_at,
              reminder_time, reminder_enabled
       from (
         select h.*,
                to_char(r.time_local, 'HH24:MI') as reminder_time,
                coalesce(r.enabled, false) as reminder_enabled
         from habits h
         left join habit_reminders r on r.habit_id = h.id
       ) habits_with_reminders
       where user_id = $1 and deleted_at is null
       order by created_at`,
      [request.user.id],
    );
    return result.rows;
  }

  @Post("habits")
  async createHabit(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateHabitInput,
  ) {
    const parsed = createHabitSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const value = parsed.data;
    if ("templateId" in value) {
      return this.database.transaction(async (client) => {
        const template = await client.query(
          `select id, name, icon, category, habit_type,
                  default_target, default_unit, default_frequency
           from habit_templates
           where id = $1 and active = true`,
          [value.templateId],
        );
        const selected = template.rows[0];
        if (!selected) {
          throw new BadRequestException("Habit template not found or unavailable.");
        }
        try {
          const result = await client.query(
            `insert into habits (
               user_id, template_id, name, icon, category, habit_type,
               target, unit, frequency
             )
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
             returning id, user_id, template_id, name, icon, category, habit_type,
                       target::float8 as target, unit, frequency, forgiving, state,
                       deleted_at, created_at, updated_at`,
            [
              request.user.id,
              selected.id,
              selected.name,
              selected.icon,
              selected.category,
              selected.habit_type,
              selected.default_target,
              selected.default_unit,
              JSON.stringify(selected.default_frequency),
            ],
          );
          return result.rows[0];
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new ConflictException("This suggested habit is already active.");
          }
          throw error;
        }
      });
    }
    const result = await this.database.query(
      `insert into habits (
         user_id, name, icon, category, habit_type, target, unit, frequency, forgiving
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       returning id, user_id, template_id, name, icon, category, habit_type,
                 target::float8 as target, unit, frequency, forgiving, state,
                 deleted_at, created_at, updated_at`,
      [
        request.user.id,
        value.name,
        value.icon,
        value.category,
        value.type,
        value.target,
        value.unit,
        JSON.stringify(value.frequency),
        value.forgiving,
      ],
    );
    return result.rows[0];
  }

  @Get("today")
  async today(
    @Req() request: AuthenticatedRequest,
    @Query("date") date = new Date().toISOString().slice(0, 10),
  ) {
    assertLocalDate(date);
    const [habits, logs] = await Promise.all([
      this.database.query(
        `select id, user_id, template_id, name, icon, category, habit_type,
                target::float8 as target, unit, frequency, forgiving, state,
                deleted_at, created_at, updated_at,
                reminder_time, reminder_enabled
         from (
           select h.*,
                  to_char(r.time_local, 'HH24:MI') as reminder_time,
                  coalesce(r.enabled, false) as reminder_enabled
           from habits h
           left join habit_reminders r on r.habit_id = h.id
         ) habits_with_reminders
         where user_id = $1 and state = 'active' and deleted_at is null`,
        [request.user.id],
      ),
      this.database.query(
        `select id, habit_id, user_id, local_date, status,
                value::float8 as value, note, prayer_status, created_at, updated_at
         from habit_daily_logs
         where user_id = $1 and local_date = $2::date`,
        [request.user.id, date],
      ),
    ]);
    const byHabit = new Map(logs.rows.map((log) => [log.habit_id, log]));
    return habits.rows
      .filter((habit) => isHabitScheduledOnDate(habit.frequency, date))
      .map((habit) => ({
        ...habit,
        todayLog: byHabit.get(habit.id) ?? null,
      }));
  }

  @Put("habits/:id/logs/:localDate")
  async checkIn(
    @Req() request: AuthenticatedRequest,
    @Param("id") habitId: string,
    @Param("localDate") localDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CheckInInput,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency-Key header is required.");
    }
    assertLocalDate(localDate);
    const parsed = checkInSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const value = parsed.data;
    return this.database.transaction(async (client) => {
      const habit = await client.query(
        `select id from habits
         where id = $1 and user_id = $2 and deleted_at is null`,
        [habitId, request.user.id],
      );
      if (!habit.rows[0]) throw new BadRequestException("Habit not found.");
      const result = await client.query(
        `insert into habit_daily_logs (
           habit_id, user_id, local_date, status, value, note,
           prayer_status, idempotency_key
         )
         values ($1, $2, $3::date, $4, $5, $6, $7, $8)
         on conflict (habit_id, local_date) do update
         set status = excluded.status,
             value = excluded.value,
             note = excluded.note,
             prayer_status = excluded.prayer_status,
             updated_at = now()
         returning id, habit_id, user_id, local_date, status,
                   value::float8 as value, note, prayer_status, created_at, updated_at`,
        [
          habitId,
          request.user.id,
          localDate,
          value.status,
          value.value,
          value.note,
          value.prayerStatus,
          idempotencyKey,
        ],
      );
      return result.rows[0];
    });
  }

  @Delete("habits/:id/logs/:localDate")
  async removeCheckIn(
    @Req() request: AuthenticatedRequest,
    @Param("id") habitId: string,
    @Param("localDate") localDate: string,
  ) {
    assertLocalDate(localDate);
    await this.database.query(
      `delete from habit_daily_logs
       where habit_id = $1 and user_id = $2 and local_date = $3::date`,
      [habitId, request.user.id, localDate],
    );
    return { deleted: true };
  }

  @Get("journal/:localDate")
  async journal(
    @Req() request: AuthenticatedRequest,
    @Param("localDate") localDate: string,
  ) {
    assertLocalDate(localDate);
    const result = await this.database.query(
      `select id, user_id, local_date, win_note, reflection_note, created_at, updated_at
       from daily_journals
       where user_id = $1 and local_date = $2::date`,
      [request.user.id, localDate],
    );
    return result.rows[0] ?? {
      id: null,
      user_id: request.user.id,
      local_date: localDate,
      win_note: null,
      reflection_note: null,
    };
  }

  @Put("journal/:localDate")
  async saveJournal(
    @Req() request: AuthenticatedRequest,
    @Param("localDate") localDate: string,
    @Body() input: JournalInput,
  ) {
    assertLocalDate(localDate);
    const parsed = journalSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.database.query(
      `insert into daily_journals (
         user_id, local_date, win_note, reflection_note
       )
       values ($1, $2::date, $3, $4)
       on conflict (user_id, local_date) do update
       set win_note = excluded.win_note,
           reflection_note = excluded.reflection_note,
           updated_at = now()
       returning id, user_id, local_date, win_note, reflection_note, created_at, updated_at`,
      [
        request.user.id,
        localDate,
        parsed.data.winNote || null,
        parsed.data.reflectionNote || null,
      ],
    );
    return result.rows[0];
  }

  @Get("tracking")
  async tracking(
    @Req() request: AuthenticatedRequest,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const dates = reportDates(from, to);
    const [habits, logs, journals] = await Promise.all([
      this.database.query(
        `select id, name, icon, habit_type, target::float8 as target, unit,
                frequency, created_at
         from habits
         where user_id = $1
           and deleted_at is null
           and created_at::date <= $2::date
         order by created_at, name`,
        [request.user.id, to],
      ),
      this.database.query(
        `select habit_id, local_date, status, value::float8 as value, note
         from habit_daily_logs
         where user_id = $1
           and local_date between $2::date and $3::date
         order by local_date, created_at`,
        [request.user.id, from, to],
      ),
      this.database.query(
        `select local_date, win_note, reflection_note
         from daily_journals
         where user_id = $1
           and local_date between $2::date and $3::date
         order by local_date`,
        [request.user.id, from, to],
      ),
    ]);

    const logByDateAndHabit = new Map(
      logs.rows.map((log) => [`${dateValue(log.local_date)}:${log.habit_id}`, log]),
    );
    const journalByDate = new Map(
      journals.rows.map((journal) => [dateValue(journal.local_date), journal]),
    );
    const days = dates.map((date) => {
      const scheduledHabits = habits.rows.filter((habit) =>
        dateValue(habit.created_at) <= date &&
        isHabitScheduledOnDate(habit.frequency, date)
      );
      const habitEntries = scheduledHabits.map((habit) => {
        const log = logByDateAndHabit.get(`${date}:${habit.id}`);
        return {
          id: habit.id,
          name: habit.name,
          icon: habit.icon,
          habit_type: habit.habit_type,
          target: habit.target,
          unit: habit.unit,
          status: log?.status ?? "not_checked",
          value: log?.value ?? null,
          note: log?.note ?? null,
        };
      });
      const completed = habitEntries.filter((habit) => habit.status === "done").length;
      const scheduled = habitEntries.length;
      const journal = journalByDate.get(date);
      return {
        date,
        completed,
        scheduled,
        completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
        winNote: journal?.win_note ?? null,
        reflectionNote: journal?.reflection_note ?? null,
        habits: habitEntries,
      };
    });
    const totalCompleted = days.reduce((sum, day) => sum + day.completed, 0);
    const totalScheduled = days.reduce((sum, day) => sum + day.scheduled, 0);
    return {
      from,
      to,
      totalCompleted,
      totalScheduled,
      completionRate: totalScheduled
        ? Math.round((totalCompleted / totalScheduled) * 100)
        : 0,
      days,
    };
  }

  @Get("notifications")
  async notifications(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query(
      `select *
       from notification_deliveries
       where user_id = $1 and channel = 'in_app'
       order by created_at desc
       limit 100`,
      [request.user.id],
    );
    return result.rows;
  }
}

export function isHabitScheduledOnDate(frequency: unknown, localDate: string) {
  if (
    !frequency ||
    typeof frequency !== "object" ||
    !("kind" in frequency) ||
    frequency.kind !== "weekdays"
  ) {
    return true;
  }
  if (!("days" in frequency) || !Array.isArray(frequency.days)) return false;
  const date = new Date(`${localDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return frequency.days.includes(date.getUTCDay());
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

function assertLocalDate(value: string) {
  if (!isLocalDate(value)) {
    throw new BadRequestException("Date must use YYYY-MM-DD.");
  }
}

function isLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function reportDates(from: string, to: string) {
  assertLocalDate(from);
  assertLocalDate(to);
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (start > end) {
    throw new BadRequestException("The start date must be on or before the end date.");
  }
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (dayCount > 366) {
    throw new BadRequestException("Choose a date range of 366 days or fewer.");
  }
  return Array.from({ length: dayCount }, (_, index) =>
    new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
  );
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
