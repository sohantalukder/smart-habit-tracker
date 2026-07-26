import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  adminCheckInSchema,
  adminHabitUpdateSchema,
  adminJournalSchema,
  adminInstallationSchema,
  adminPasswordChangeSchema,
  adminPrayerLogSchema,
  adminPrayerReminderSchema,
  adminPrayerSettingsSchema,
  adminRoleUpdateSchema,
  adminRestrictionSchema,
  adminTemplateUpdateSchema,
  adminUserUpdateSchema,
  announcementSchema,
} from "./contracts";
import type { AuthenticatedRequest } from "./auth/auth.guard";
import { hashPassword, verifyPassword } from "./auth/password";
import {
  requireAdminPortal,
  requireIdempotency,
  requireSuperAdmin,
} from "./auth/support-access";
import { VerificationEmailService } from "./auth/verification-email.service";
import { ApiException } from "./platform/api.exception";
import { AuditService } from "./platform/audit.service";
import { DatabaseService } from "./platform/database.service";
import { QueueService } from "./platform/queue.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly email: VerificationEmailService,
  ) {}

  @Get("session")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async session(@Req() request: AuthenticatedRequest) {
    return requireAdminPortal(request, this.database);
  }

  @Get("users")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async users(
    @Req() request: AuthenticatedRequest,
    @Query("q") query = "",
    @Query("page") pageValue = "1",
    @Query("limit") limitValue = "50",
  ) {
    await requireAdminPortal(request, this.database);
    const search = query.trim();
    const page = positiveInteger(pageValue, 1);
    const pageSize = Math.min(100, positiveInteger(limitValue, 50));
    const offset = (page - 1) * pageSize;
    const result = await this.database.query(
      `select p.id, u.email, p.name, p.timezone, p.units, p.created_at,
              p.suspended_at, p.deleted_at,
              m.role,
              count(*) over()::int as total_count
       from profiles p
       join users u on u.id = p.id
       left join admin_memberships m on m.user_id = p.id
       where $1 = ''
          or p.name ilike '%' || $1 || '%'
          or u.email ilike '%' || $1 || '%'
       order by p.created_at desc
       limit $2 offset $3`,
      [search, pageSize, offset],
    );
    const count = Number(result.rows[0]?.total_count ?? 0);
    return {
      data: result.rows.map(({ total_count: _, ...row }) => row),
      count,
      page,
      pageSize,
    };
  }

  @Patch("users/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateUser(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = adminRestrictionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const support = await requireAdminPortal(request, this.database);
    return this.idempotent(request, `PATCH:/admin/users/${id}`, async () => {
      await this.assertCanRestrictUser(support, id, parsed.data.suspended);
      const result = await this.database.query(
        `update profiles
         set suspended_at = case when $2 then now() else null end,
             updated_at = now()
         where id = $1
         returning id, name, suspended_at`,
        [id, parsed.data.suspended],
      );
      const profile = result.rows[0];
      if (!profile) throw new BadRequestException("User not found.");
      if (parsed.data.suspended) {
        await this.database.query(
          `update user_sessions
           set revoked_at = now()
           where user_id = $1 and revoked_at is null`,
          [id],
        );
      }
      const email = await this.database.query<{ email: string }>(
        "select email from users where id = $1",
        [id],
      );
      await this.audit.record({
        actorId: support.userId,
        action: parsed.data.suspended ? "user.suspended" : "user.reactivated",
        targetType: "profile",
        targetId: id,
        correlationId: request.correlationId,
        metadata: { reason: parsed.data.reason },
      });
      return { ...profile, email: email.rows[0]?.email ?? "" };
    });
  }

  @Get("users/:id/details")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async userDetails(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    await requireAdminPortal(request, this.database);
    const [
      account,
      habits,
      logs,
      journals,
      prayerLogs,
      prayerReminders,
      notifications,
      sessions,
      verificationRequests,
      installations,
    ] = await Promise.all([
      this.database.query(
        `select p.id, u.email, p.name, p.timezone, p.units,
                p.goal_preferences, p.starting_pace, p.religion_preference,
                p.daily_digest_time::text, p.daily_digest_enabled,
                p.prayer_enabled, p.latitude::float8 as latitude,
                p.longitude::float8 as longitude, p.madhab,
                p.prayer_calculation_method,
                p.onboarding_completed_at, p.suspended_at, p.deleted_at,
                p.created_at, p.updated_at, m.role
         from profiles p
         join users u on u.id = p.id
         left join admin_memberships m on m.user_id = p.id
         where p.id = $1`,
        [id],
      ),
      this.database.query(
        `select h.id, h.name, h.icon, h.category, h.habit_type,
                h.target::float8 as target, h.unit, h.frequency, h.forgiving,
                h.state, h.deleted_at, h.created_at, h.updated_at,
                r.enabled as reminder_enabled, r.time_local::text as reminder_time
         from habits h
         left join habit_reminders r on r.habit_id = h.id
         where h.user_id = $1
         order by h.deleted_at nulls first, h.created_at desc`,
        [id],
      ),
      this.database.query(
        `select l.id, l.habit_id, h.name as habit_name, l.local_date,
                l.status, l.value::float8 as value, l.note, l.prayer_status,
                l.created_at, l.updated_at
         from habit_daily_logs l
         join habits h on h.id = l.habit_id
         where l.user_id = $1
         order by l.local_date desc, l.created_at desc
         limit 100`,
        [id],
      ),
      this.database.query(
        `select id, local_date, win_note, reflection_note, created_at, updated_at
         from daily_journals
         where user_id = $1
         order by local_date desc
         limit 100`,
        [id],
      ),
      this.database.query(
        `select id, local_date, prayer_name, status, created_at, updated_at
         from prayer_logs
         where user_id = $1
         order by local_date desc, prayer_name
         limit 200`,
        [id],
      ),
      this.database.query(
        `select prayer_name, enabled, offset_minutes, updated_at
         from prayer_reminder_settings
         where user_id = $1
         order by prayer_name`,
        [id],
      ),
      this.database.query(
        `select id, channel, title, body, scheduled_at, sent_at, state,
                attempt_count, error_message, created_at
         from notification_deliveries
         where user_id = $1
         order by scheduled_at desc
         limit 100`,
        [id],
      ),
      this.database.query(
        `select id, expires_at, revoked_at, created_at
         from user_sessions
         where user_id = $1
         order by created_at desc
         limit 100`,
        [id],
      ),
      this.database.query(
        `select id, 'email_verification' as kind, null::text as pending_email,
                expires_at, consumed_at, created_at
         from email_verification_tokens
         where user_id = $1
         union all
         select id, 'email_change' as kind, pending_email,
                expires_at, consumed_at, created_at
         from email_change_tokens
         where user_id = $1
         order by created_at desc
         limit 100`,
        [id],
      ),
      this.database.query(
        `select id, platform, active, last_seen_at, created_at, updated_at
         from firebase_installations
         where user_id = $1
         order by last_seen_at desc
         limit 100`,
        [id],
      ),
    ]);
    if (!account.rows[0]) throw new BadRequestException("User not found.");
    return {
      account: account.rows[0],
      habits: habits.rows,
      checkIns: logs.rows,
      journals: journals.rows,
      prayerLogs: prayerLogs.rows,
      prayerReminders: prayerReminders.rows,
      notifications: notifications.rows,
      sessions: sessions.rows,
      verificationRequests: verificationRequests.rows,
      installations: installations.rows,
    };
  }

  @Patch("users/:id/profile")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateUserProfile(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminUserUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(request, `PATCH:/admin/users/${id}/profile`, async () => {
      await this.assertCanAssignRole(support, id, parsed.data.role);
      const email = parsed.data.email.trim().toLowerCase();
      let previousEmail = "";
      let updated;
      try {
        updated = await this.database.transaction(async (client) => {
          const current = await client.query<{ email: string }>(
            "select email from users where id = $1 for update",
            [id],
          );
          if (!current.rows[0]) throw new BadRequestException("User not found.");
          previousEmail = current.rows[0].email;
          await client.query(
            `update users
             set email = $2,
                 email_verified_at = case when email = $2 then email_verified_at else now() end,
                 updated_at = now()
             where id = $1`,
            [id, email],
          );
          const profile = await client.query(
            `update profiles
             set name = $2, timezone = $3, units = $4,
                 goal_preferences = $5, starting_pace = $6,
                 religion_preference = $7,
                 daily_digest_time = $8::time,
                 daily_digest_enabled = $9,
                 updated_at = now()
             where id = $1 and deleted_at is null
             returning id, name, timezone, units, goal_preferences,
                       starting_pace, religion_preference,
                       daily_digest_time::text, daily_digest_enabled, updated_at`,
            [
              id,
              parsed.data.name,
              parsed.data.timezone,
              parsed.data.units,
              parsed.data.goals,
              parsed.data.pace,
              parsed.data.religion,
              parsed.data.dailyDigestTime,
              parsed.data.dailyDigestEnabled,
            ],
          );
          if (!profile.rows[0]) throw new BadRequestException("User not found.");
          if (parsed.data.role) {
            await client.query(
              `insert into admin_memberships (user_id, role, created_by)
               values ($1, $2::admin_role, $3)
               on conflict (user_id) do update set role = excluded.role`,
              [id, parsed.data.role, support.userId],
            );
          } else {
            await client.query(
              "delete from admin_memberships where user_id = $1",
              [id],
            );
          }
          if (previousEmail !== email) {
            await client.query(
              `update user_sessions
               set revoked_at = now()
               where user_id = $1 and revoked_at is null`,
              [id],
            );
          }
          return { ...profile.rows[0], email, role: parsed.data.role };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("That email address is already in use.");
        }
        throw error;
      }
      await this.audit.record({
        actorId: support.userId,
        action: "user.profile_updated",
        targetType: "profile",
        targetId: id,
        correlationId: request.correlationId,
        metadata: {
          fields: Object.keys(parsed.data),
          emailChanged: previousEmail !== email,
        },
      });
      if (previousEmail !== email) {
        await Promise.all([
          this.email.sendSecurityNotice(
            previousEmail,
            "Your Bloom sign-in email was changed",
            `A Bloom super admin changed your sign-in email to ${email}. All previous sessions were disconnected.`,
          ),
          this.email.sendSecurityNotice(
            email,
            "Your Bloom sign-in email was changed",
            `This address is now the sign-in email for your Bloom account. All previous sessions were disconnected.`,
          ),
        ]);
      }
      return updated;
    });
  }

  @Patch("users/:id/role")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateUserRole(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminRoleUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(request, `PATCH:/admin/users/${id}/role`, async () => {
      const previousRole = await this.assertCanAssignRole(support, id, parsed.data.role);
      if (parsed.data.role) {
        await this.database.query(
          `insert into admin_memberships (user_id, role, created_by)
           values ($1, $2::admin_role, $3)
           on conflict (user_id) do update set role = excluded.role`,
          [id, parsed.data.role, support.userId],
        );
      } else {
        await this.database.query(
          "delete from admin_memberships where user_id = $1",
          [id],
        );
      }
      await this.audit.record({
        actorId: support.userId,
        action: "user.role_updated",
        targetType: "admin_membership",
        targetId: id,
        correlationId: request.correlationId,
        metadata: {
          previousRole,
          nextRole: parsed.data.role,
        },
      });
      return { id, role: parsed.data.role };
    });
  }

  @Patch("users/:id/prayer-settings")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateUserPrayerSettings(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminPrayerSettingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(
      request,
      `PATCH:/admin/users/${id}/prayer-settings`,
      async () => {
        const result = await this.database.transaction(async (client) => {
          const updated = await client.query(
            `update profiles
             set prayer_enabled = $2,
                 religion_preference = case when $2 then 'muslim' else religion_preference end,
                 faith_preference = case when $2 then 'muslim' else faith_preference end,
                 latitude = $3,
                 longitude = $4,
                 location_updated_at = case when $2 then now() else null end,
                 madhab = $5,
                 prayer_calculation_method = $6,
                 updated_at = now()
             where id = $1 and deleted_at is null
             returning id, prayer_enabled, latitude::float8 as latitude,
                       longitude::float8 as longitude, madhab,
                       prayer_calculation_method, updated_at`,
            [
              id,
              parsed.data.enabled,
              parsed.data.enabled ? parsed.data.latitude : null,
              parsed.data.enabled ? parsed.data.longitude : null,
              parsed.data.enabled ? parsed.data.madhab : null,
              parsed.data.enabled ? parsed.data.calculationMethod : null,
            ],
          );
          if (!updated.rows[0]) throw new BadRequestException("User not found.");
          if (!parsed.data.enabled) {
            await client.query(
              "delete from prayer_reminder_settings where user_id = $1",
              [id],
            );
            await client.query(
              `update notification_deliveries
               set state = 'cancelled'
               where user_id = $1 and source_type = 'prayer' and state = 'scheduled'`,
              [id],
            );
          }
          return updated.rows[0];
        });
        await this.audit.record({
          actorId: support.userId,
          action: "user.prayer_settings_updated",
          targetType: "profile",
          targetId: id,
          correlationId: request.correlationId,
          metadata: { enabled: parsed.data.enabled },
        });
        return result;
      },
    );
  }

  @Post("users/:id/password")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async changeUserPassword(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminPasswordChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (support.userId === id) {
      throw new BadRequestException("Use your own account settings to change your password.");
    }
    return this.idempotent(
      request,
      `POST:/admin/users/${id}/password`,
      async () => {
        const actor = await this.database.query<{ password_hash: string }>(
          "select password_hash from users where id = $1",
          [support.userId],
        );
        if (
          !actor.rows[0] ||
          !(await verifyPassword(parsed.data.adminPassword, actor.rows[0].password_hash))
        ) {
          throw new ApiException(
            401,
            "ADMIN_PASSWORD_INCORRECT",
            "Your administrator password is incorrect.",
          );
        }
        const existing = await this.database.query<{
          email: string;
          password_hash: string;
        }>(
          "select email, password_hash from users where id = $1",
          [id],
        );
        if (!existing.rows[0]) throw new BadRequestException("User not found.");
        if (
          await verifyPassword(
            parsed.data.newPassword,
            existing.rows[0].password_hash,
          )
        ) {
          throw new ApiException(
            400,
            "PASSWORD_REUSED",
            "Choose a password the user is not already using.",
          );
        }
        const passwordHash = await hashPassword(parsed.data.newPassword);
        const revoked = await this.database.transaction(async (client) => {
          await client.query(
            `update users
             set password_hash = $2, updated_at = now()
             where id = $1`,
            [id, passwordHash],
          );
          const sessions = await client.query(
            `update user_sessions
             set revoked_at = now()
             where user_id = $1 and revoked_at is null
             returning id`,
            [id],
          );
          return sessions.rowCount ?? 0;
        });
        await this.audit.record({
          actorId: support.userId,
          action: "user.password_changed_by_admin",
          targetType: "account",
          targetId: id,
          correlationId: request.correlationId,
          metadata: { sessionsRevoked: revoked },
        });
        await this.email.sendSecurityNotice(
          existing.rows[0].email,
          "Your Bloom password was changed",
          "A Bloom super admin changed your password and disconnected every signed-in device. Contact support immediately if you did not expect this change.",
        );
        return {
          changed: true,
          sessionsRevoked: revoked,
        };
      },
    );
  }

  @Patch("users/:userId/habits/:habitId")
  async updateUserHabit(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("habitId") habitId: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminHabitUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(
      request,
      `PATCH:/admin/users/${userId}/habits/${habitId}`,
      async () => {
        const result = await this.database.query(
          `update habits
           set name = $3, icon = $4, category = $5, habit_type = $6,
               target = $7, unit = $8, frequency = $9::jsonb,
               forgiving = $10, state = $11,
               deleted_at = case when $11 = 'archived' then coalesce(deleted_at, now()) else null end,
               updated_at = now()
           where id = $1 and user_id = $2
           returning id, name, icon, category, habit_type,
                     target::float8 as target, unit, frequency, forgiving,
                     state, deleted_at, updated_at`,
          [
            habitId,
            userId,
            parsed.data.name,
            parsed.data.icon,
            parsed.data.category,
            parsed.data.type,
            parsed.data.target,
            parsed.data.unit,
            JSON.stringify(parsed.data.frequency),
            parsed.data.forgiving,
            parsed.data.state,
          ],
        );
        if (!result.rows[0]) throw new BadRequestException("Habit not found.");
        if (
          parsed.data.reminderEnabled !== undefined ||
          parsed.data.reminderTime !== undefined
        ) {
          if (parsed.data.reminderEnabled && !parsed.data.reminderTime) {
            throw new BadRequestException("A reminder time is required when reminders are enabled.");
          }
          if (parsed.data.reminderTime) {
            await this.database.query(
              `insert into habit_reminders (habit_id, user_id, enabled, time_local)
               values ($1, $2, $3, $4::time)
               on conflict (habit_id) do update
               set enabled = excluded.enabled,
                   time_local = excluded.time_local,
                   updated_at = now()`,
              [
                habitId,
                userId,
                parsed.data.reminderEnabled ?? false,
                parsed.data.reminderTime,
              ],
            );
          } else if (parsed.data.reminderEnabled === false) {
            await this.database.query(
              `update habit_reminders
               set enabled = false, updated_at = now()
               where habit_id = $1 and user_id = $2`,
              [habitId, userId],
            );
          }
        }
        await this.audit.record({
          actorId: support.userId,
          action: "user.habit_updated",
          targetType: "habit",
          targetId: habitId,
          correlationId: request.correlationId,
          metadata: { userId },
        });
        return result.rows[0];
      },
    );
  }

  @Put("users/:userId/habits/:habitId/check-ins/:localDate")
  async saveUserCheckIn(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("habitId") habitId: string,
    @Param("localDate") localDate: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminCheckInSchema.safeParse({ ...(asObject(body)), localDate });
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(
      request,
      `PUT:/admin/users/${userId}/habits/${habitId}/check-ins/${localDate}`,
      async () => {
        const habit = await this.database.query(
          "select id from habits where id = $1 and user_id = $2",
          [habitId, userId],
        );
        if (!habit.rows[0]) throw new BadRequestException("Habit not found.");
        const result = await this.database.query(
          `insert into habit_daily_logs (
             habit_id, user_id, local_date, status, value, note,
             prayer_status, idempotency_key
           )
           values ($1, $2, $3::date, $4, $5, $6, $7, $8)
           on conflict (habit_id, local_date) do update
           set status = excluded.status, value = excluded.value,
               note = excluded.note, prayer_status = excluded.prayer_status,
               updated_at = now()
           returning id, habit_id, local_date, status, value::float8 as value,
                     note, prayer_status, created_at, updated_at`,
          [
            habitId,
            userId,
            localDate,
            parsed.data.status,
            parsed.data.value,
            parsed.data.note,
            parsed.data.prayerStatus,
            `${support.userId}:${request.correlationId}`,
          ],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.check_in_updated",
          targetType: "habit_log",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, habitId, localDate },
        });
        return result.rows[0];
      },
    );
  }

  @Delete("users/:userId/habits/:habitId/check-ins/:localDate")
  async deleteUserCheckIn(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("habitId") habitId: string,
    @Param("localDate") localDate: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    assertLocalDate(localDate);
    return this.idempotent(
      request,
      `DELETE:/admin/users/${userId}/habits/${habitId}/check-ins/${localDate}`,
      async () => {
        const result = await this.database.query(
          `delete from habit_daily_logs
           where user_id = $1 and habit_id = $2 and local_date = $3::date
           returning id`,
          [userId, habitId, localDate],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.check_in_deleted",
          targetType: "habit_log",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, habitId, localDate },
        });
        return { deleted: Boolean(result.rows[0]) };
      },
    );
  }

  @Put("users/:userId/journals/:localDate")
  async saveUserJournal(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("localDate") localDate: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminJournalSchema.safeParse({ ...(asObject(body)), localDate });
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(
      request,
      `PUT:/admin/users/${userId}/journals/${localDate}`,
      async () => {
        const result = await this.database.query(
          `insert into daily_journals (
             user_id, local_date, win_note, reflection_note
           )
           values ($1, $2::date, $3, $4)
           on conflict (user_id, local_date) do update
           set win_note = excluded.win_note,
               reflection_note = excluded.reflection_note,
               updated_at = now()
           returning id, local_date, win_note, reflection_note, created_at, updated_at`,
          [
            userId,
            localDate,
            parsed.data.winNote || null,
            parsed.data.reflectionNote || null,
          ],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.journal_updated",
          targetType: "daily_journal",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, localDate },
        });
        return result.rows[0];
      },
    );
  }

  @Delete("users/:userId/journals/:localDate")
  async deleteUserJournal(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("localDate") localDate: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    assertLocalDate(localDate);
    return this.idempotent(
      request,
      `DELETE:/admin/users/${userId}/journals/${localDate}`,
      async () => {
        const result = await this.database.query(
          `delete from daily_journals
           where user_id = $1 and local_date = $2::date
           returning id`,
          [userId, localDate],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.journal_deleted",
          targetType: "daily_journal",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, localDate },
        });
        return { deleted: Boolean(result.rows[0]) };
      },
    );
  }

  @Put("users/:userId/prayers/:prayer/logs/:localDate")
  async saveUserPrayerLog(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("prayer") prayer: string,
    @Param("localDate") localDate: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminPrayerLogSchema.safeParse({
      ...(asObject(body)),
      localDate,
    });
    if (!parsed.success || !isPrayerName(prayer)) {
      throw new BadRequestException(
        parsed.success ? "Use a valid prayer name." : parsed.error.issues,
      );
    }
    return this.idempotent(
      request,
      `PUT:/admin/users/${userId}/prayers/${prayer}/logs/${localDate}`,
      async () => {
        const result = await this.database.query(
          `insert into prayer_logs (
             user_id, local_date, prayer_name, status, idempotency_key
           )
           values ($1, $2::date, $3, $4, $5)
           on conflict (user_id, local_date, prayer_name) do update
           set status = excluded.status, updated_at = now()
           returning id, local_date, prayer_name, status, created_at, updated_at`,
          [
            userId,
            localDate,
            prayer,
            parsed.data.status,
            `${support.userId}:${request.correlationId}`,
          ],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.prayer_log_updated",
          targetType: "prayer_log",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, prayer, localDate },
        });
        return result.rows[0];
      },
    );
  }

  @Delete("users/:userId/prayers/:prayer/logs/:localDate")
  async deleteUserPrayerLog(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("prayer") prayer: string,
    @Param("localDate") localDate: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    assertLocalDate(localDate);
    if (!isPrayerName(prayer)) throw new BadRequestException("Use a valid prayer name.");
    return this.idempotent(
      request,
      `DELETE:/admin/users/${userId}/prayers/${prayer}/logs/${localDate}`,
      async () => {
        const result = await this.database.query(
          `delete from prayer_logs
           where user_id = $1 and prayer_name = $2 and local_date = $3::date
           returning id`,
          [userId, prayer, localDate],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.prayer_log_deleted",
          targetType: "prayer_log",
          targetId: String(result.rows[0]?.id ?? ""),
          correlationId: request.correlationId,
          metadata: { userId, prayer, localDate },
        });
        return { deleted: Boolean(result.rows[0]) };
      },
    );
  }

  @Put("users/:userId/prayer-reminders/:prayer")
  async saveUserPrayerReminder(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("prayer") prayer: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminPrayerReminderSchema.safeParse(body);
    if (!parsed.success || !isPrayerName(prayer)) {
      throw new BadRequestException(
        parsed.success ? "Use a valid prayer name." : parsed.error.issues,
      );
    }
    return this.idempotent(
      request,
      `PUT:/admin/users/${userId}/prayer-reminders/${prayer}`,
      async () => {
        const result = await this.database.query(
          `insert into prayer_reminder_settings (
             user_id, prayer_name, enabled, offset_minutes
           )
           values ($1, $2, $3, $4)
           on conflict (user_id, prayer_name) do update
           set enabled = excluded.enabled,
               offset_minutes = excluded.offset_minutes,
               updated_at = now()
           returning prayer_name, enabled, offset_minutes, updated_at`,
          [userId, prayer, parsed.data.enabled, parsed.data.offsetMinutes],
        );
        await this.audit.record({
          actorId: support.userId,
          action: "user.prayer_reminder_updated",
          targetType: "prayer_reminder",
          targetId: `${userId}:${prayer}`,
          correlationId: request.correlationId,
          metadata: { userId, prayer },
        });
        return result.rows[0];
      },
    );
  }

  @Post("users/:id/sessions/revoke")
  async revokeUserSessions(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    return this.idempotent(request, `POST:/admin/users/${id}/sessions/revoke`, async () => {
      const result = await this.database.query(
        `update user_sessions
         set revoked_at = now()
         where user_id = $1 and revoked_at is null
         returning id`,
        [id],
      );
      await this.audit.record({
        actorId: support.userId,
        action: "user.sessions_revoked",
        targetType: "account",
        targetId: id,
        correlationId: request.correlationId,
        metadata: { sessionsRevoked: result.rowCount ?? 0 },
      });
      return { sessionsRevoked: result.rowCount ?? 0 };
    });
  }

  @Post("users/:id/verification-requests/invalidate")
  async invalidateVerificationRequests(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    return this.idempotent(
      request,
      `POST:/admin/users/${id}/verification-requests/invalidate`,
      async () => {
        const [emailVerification, emailChange] = await Promise.all([
          this.database.query(
            `update email_verification_tokens
             set consumed_at = now()
             where user_id = $1 and consumed_at is null
             returning id`,
            [id],
          ),
          this.database.query(
            `update email_change_tokens
             set consumed_at = now()
             where user_id = $1 and consumed_at is null
             returning id`,
            [id],
          ),
        ]);
        const invalidated =
          (emailVerification.rowCount ?? 0) + (emailChange.rowCount ?? 0);
        await this.audit.record({
          actorId: support.userId,
          action: "user.verification_requests_invalidated",
          targetType: "account",
          targetId: id,
          correlationId: request.correlationId,
          metadata: { invalidated },
        });
        return { invalidated };
      },
    );
  }

  @Patch("users/:userId/installations/:installationId")
  async updateInstallation(
    @Req() request: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("installationId") installationId: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminInstallationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(
      request,
      `PATCH:/admin/users/${userId}/installations/${installationId}`,
      async () => {
        const result = await this.database.query(
          `update firebase_installations
           set active = $3, updated_at = now()
           where id = $1 and user_id = $2
           returning id, platform, active, last_seen_at, created_at, updated_at`,
          [installationId, userId, parsed.data.active],
        );
        if (!result.rows[0]) throw new BadRequestException("Installation not found.");
        await this.audit.record({
          actorId: support.userId,
          action: parsed.data.active
            ? "user.installation_activated"
            : "user.installation_deactivated",
          targetType: "firebase_installation",
          targetId: installationId,
          correlationId: request.correlationId,
          metadata: { userId },
        });
        return result.rows[0];
      },
    );
  }

  @Get("templates")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async templates(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    const result = await this.database.query(
      `select id, slug, name, description, category, habit_type, icon,
              default_target::float8 as default_target, default_unit,
              default_frequency, goal_tags, recommendation_priority,
              active, created_at, updated_at
       from habit_templates
       order by category, name`,
    );
    return result.rows;
  }

  @Post("templates")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(request, "POST:/admin/templates", async () => {
      let result;
      try {
        result = await this.database.query(
          `insert into habit_templates (
             slug, name, description, category, habit_type, icon,
             default_target, default_unit, default_frequency,
             goal_tags, recommendation_priority, active
           )
           values (
             $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12
           )
           returning id, slug, name, description, category, habit_type, icon,
                     default_target::float8 as default_target, default_unit,
                     default_frequency, goal_tags, recommendation_priority,
                     active, created_at, updated_at`,
          [
            parsed.data.slug,
            parsed.data.name,
            parsed.data.description,
            parsed.data.category,
            parsed.data.type,
            parsed.data.icon,
            parsed.data.target,
            parsed.data.unit,
            JSON.stringify(parsed.data.frequency),
            parsed.data.goals,
            parsed.data.priority,
            parsed.data.active,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("A template with that slug already exists.");
        }
        throw error;
      }
      const template = result.rows[0];
      await this.audit.record({
        actorId: support.userId,
        action: "template.created",
        targetType: "habit_template",
        targetId: String(template?.id ?? ""),
        correlationId: request.correlationId,
        metadata: { name: template?.name },
      });
      return template;
    });
  }

  @Patch("templates/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateTemplate(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = adminTemplateUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(request, `PATCH:/admin/templates/${id}`, async () => {
      let result;
      try {
        result = await this.database.query(
          `update habit_templates
           set slug = $2, name = $3, description = $4, category = $5,
               habit_type = $6, icon = $7, default_target = $8,
               default_unit = $9, default_frequency = $10::jsonb,
               goal_tags = $11, recommendation_priority = $12,
               active = $13, updated_at = now()
           where id = $1
           returning id, slug, name, description, category, habit_type, icon,
                     default_target::float8 as default_target, default_unit,
                     default_frequency, goal_tags, recommendation_priority,
                     active, created_at, updated_at`,
          [
            id,
            parsed.data.slug,
            parsed.data.name,
            parsed.data.description,
            parsed.data.category,
            parsed.data.type,
            parsed.data.icon,
            parsed.data.target,
            parsed.data.unit,
            JSON.stringify(parsed.data.frequency),
            parsed.data.goals,
            parsed.data.priority,
            parsed.data.active,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("A template with that slug already exists.");
        }
        throw error;
      }
      const template = result.rows[0];
      if (!template) throw new BadRequestException("Template not found.");
      await this.audit.record({
        actorId: support.userId,
        action: "template.updated",
        targetType: "habit_template",
        targetId: id,
        correlationId: request.correlationId,
        metadata: { fields: Object.keys(parsed.data) },
      });
      return template;
    });
  }

  @Get("notifications")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async notifications(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    const result = await this.database.query(
      `select d.*,
              json_build_object('email', u.email, 'name', p.name) as profiles
       from notification_deliveries d
       join profiles p on p.id = d.user_id
       join users u on u.id = p.id
       order by d.scheduled_at desc
       limit 200`,
    );
    return result.rows;
  }

  @Post("notifications/:id/retry")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async retryNotification(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    return this.idempotent(request, `POST:/admin/notifications/${id}/retry`, async () => {
      const result = await this.database.query<{ id: string; channel: string }>(
        `update notification_deliveries
         set state = 'scheduled', error_message = null
         where id = $1
         returning id, channel`,
        [id],
      );
      if (!result.rows[0]) throw new BadRequestException("Delivery not found.");
      await this.queue.add("notification.deliver", { deliveryId: id }, `retry-${id}-${Date.now()}`);
      await this.audit.record({
        actorId: support.userId,
        action: "notification.retried",
        targetType: "notification_delivery",
        targetId: id,
        correlationId: request.correlationId,
      });
      return { status: "queued", deliveryId: id };
    });
  }

  @Post("notifications/:id/cancel")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async cancelNotification(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    return this.idempotent(request, `POST:/admin/notifications/${id}/cancel`, async () => {
      const result = await this.database.query<{ id: string }>(
        `update notification_deliveries
         set state = 'cancelled'
         where id = $1 and state in ('scheduled', 'failed')
         returning id`,
        [id],
      );
      if (!result.rows[0]) {
        throw new BadRequestException("Only scheduled or failed deliveries can be cancelled.");
      }
      await this.audit.record({
        actorId: support.userId,
        action: "notification.cancelled",
        targetType: "notification_delivery",
        targetId: id,
        correlationId: request.correlationId,
      });
      return { status: "cancelled", deliveryId: id };
    });
  }

  @Post("announcements")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async announcement(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const support = await requireSuperAdmin(request, this.database);
    const parsed = announcementSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.idempotent(request, "POST:/admin/announcements", async () => {
      const now = new Date();
      const inserted = await this.database.query(
        `insert into notification_deliveries (
           user_id, channel, title, body, scheduled_at
         )
         select p.id, c.channel, $1, $2, $3
         from profiles p
         cross join unnest($4::text[]) as c(channel)
         where p.suspended_at is null and p.deleted_at is null
         returning id`,
        [parsed.data.title, parsed.data.body, now, parsed.data.channels],
      );
      await this.queue.add("announcement.deliver", { scheduledAt: now.toISOString() }, `announcement-${request.correlationId}`);
      await this.audit.record({
        actorId: support.userId,
        action: "announcement.created",
        targetType: "notification_delivery",
        correlationId: request.correlationId,
        metadata: {
          deliveries: inserted.rowCount,
          channels: parsed.data.channels,
        },
      });
      return {
        status: "queued",
        recipients: parsed.data.channels.length
          ? Math.floor((inserted.rowCount ?? 0) / parsed.data.channels.length)
          : 0,
      };
    });
  }

  @Get("analytics")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async analytics(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    const result = await this.database.query<{
      users: number;
      active_habits: number;
      delivered_notifications: number;
    }>(
      `select
         (select count(*)::int from profiles) as users,
         (select count(*)::int from habits where deleted_at is null) as active_habits,
         (select count(*)::int from notification_deliveries where state = 'sent')
           as delivered_notifications`,
    );
    const row = result.rows[0];
    return {
      users: row?.users ?? 0,
      activeHabits: row?.active_habits ?? 0,
      deliveredNotifications: row?.delivered_notifications ?? 0,
    };
  }

  @Get("health")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async health(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    return {
      api: "healthy",
      postgres: this.database.configured() ? "configured" : "missing_credentials",
      queue: await this.queue.stats(),
    };
  }

  @Get("audit-logs")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async auditLogs(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    const result = await this.database.query(
      `select a.*,
              case when p.id is null then null
                   else json_build_object('email', u.email, 'name', p.name)
              end as profiles
       from audit_logs a
       left join profiles p on p.id = a.actor_id
       left join users u on u.id = p.id
       order by a.created_at desc
       limit 200`,
    );
    return result.rows;
  }

  private async assertCanRestrictUser(
    support: { userId: string; role: "support" | "super_admin" },
    targetId: string,
    suspending: boolean,
  ) {
    if (support.userId === targetId) {
      throw new BadRequestException("You cannot suspend your own administrator account.");
    }
    const target = await this.database.query<{
      role: "support" | "moderator" | "super_admin" | null;
    }>(
      `select m.role
       from profiles p
       left join admin_memberships m on m.user_id = p.id
       where p.id = $1`,
      [targetId],
    );
    const profile = target.rows[0];
    if (!profile) throw new BadRequestException("User not found.");
    if (profile.role && support.role !== "super_admin") {
      throw new ForbiddenException("Only a super admin can restrict another administrator.");
    }
    if (suspending && profile.role === "super_admin") {
      const remaining = await this.database.query<{ count: number }>(
        `select count(*)::int as count
         from admin_memberships m
         join profiles p on p.id = m.user_id
         where m.role = 'super_admin'
           and m.user_id <> $1
           and p.suspended_at is null
           and p.deleted_at is null`,
        [targetId],
      );
      if (Number(remaining.rows[0]?.count ?? 0) < 1) {
        throw new ConflictException("The last active super admin cannot be suspended.");
      }
    }
  }

  private async assertCanAssignRole(
    support: { userId: string; role: "support" | "super_admin" },
    targetId: string,
    nextRole: "support" | "super_admin" | null,
  ) {
    if (support.role !== "super_admin") {
      throw new ForbiddenException("Only a super admin can change administrator roles.");
    }
    if (support.userId === targetId && nextRole !== "super_admin") {
      throw new BadRequestException("You cannot remove your own super-admin access.");
    }
    const current = await this.database.query<{
      role: "support" | "moderator" | "super_admin" | null;
    }>(
      `select m.role
       from profiles p
       left join admin_memberships m on m.user_id = p.id
       where p.id = $1`,
      [targetId],
    );
    if (!current.rows[0]) throw new BadRequestException("User not found.");
    if (current.rows[0].role === "super_admin" && nextRole !== "super_admin") {
      const remaining = await this.database.query<{ count: number }>(
        `select count(*)::int as count
         from admin_memberships m
         join profiles p on p.id = m.user_id
         where m.role = 'super_admin'
           and m.user_id <> $1
           and p.suspended_at is null
           and p.deleted_at is null`,
        [targetId],
      );
      if (Number(remaining.rows[0]?.count ?? 0) < 1) {
        throw new ConflictException("The last active super admin cannot be demoted.");
      }
    }
    return current.rows[0].role;
  }

  private async idempotent<T>(
    request: AuthenticatedRequest,
    route: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const key = requireIdempotency(request);
    const existing = await this.database.query<{ response_body: T }>(
      `select response_body
       from idempotency_records
       where user_id = $1 and key = $2 and route = $3 and expires_at > now()`,
      [request.user.id, key, route],
    );
    if (existing.rows[0]) return existing.rows[0].response_body;
    const result = await work();
    await this.database.query(
      `insert into idempotency_records (
         user_id, key, route, response_status, response_body
       )
       values ($1, $2, $3, 200, $4::jsonb)
       on conflict (user_id, key, route) do nothing`,
      [request.user.id, key, route, JSON.stringify(result)],
    );
    return result;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function assertLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("Use a valid date in YYYY-MM-DD format.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException("Use a valid date in YYYY-MM-DD format.");
  }
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

function isPrayerName(value: string) {
  return ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(value);
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
