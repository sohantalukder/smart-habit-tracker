import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { announcementSchema } from "./contracts";
import type { AuthenticatedRequest } from "./auth/auth.guard";
import { requireAdminPortal, requireIdempotency } from "./auth/support-access";
import { AuditService } from "./platform/audit.service";
import { DatabaseService } from "./platform/database.service";
import { QueueService } from "./platform/queue.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
  ) {}

  @Get("session")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async session(@Req() request: AuthenticatedRequest) {
    return requireAdminPortal(request, this.database);
  }

  @Get("users")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async users(@Req() request: AuthenticatedRequest, @Query("q") query = "") {
    await requireAdminPortal(request, this.database);
    const search = query.trim();
    const result = await this.database.query(
      `select p.id, u.email, p.name, p.timezone, p.created_at,
              p.suspended_at, p.deleted_at,
              count(*) over()::int as total_count
       from profiles p
       join users u on u.id = p.id
       where $1 = ''
          or p.name ilike '%' || $1 || '%'
          or u.email ilike '%' || $1 || '%'
       order by p.created_at desc
       limit 100`,
      [search],
    );
    const count = Number(result.rows[0]?.total_count ?? 0);
    return {
      data: result.rows.map(({ total_count: _, ...row }) => row),
      count,
    };
  }

  @Patch("users/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async updateUser(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { suspended: boolean },
  ) {
    const support = await requireAdminPortal(request, this.database);
    return this.idempotent(request, `PATCH:/admin/users/${id}`, async () => {
      const result = await this.database.query(
        `update profiles
         set suspended_at = case when $2 then now() else null end,
             updated_at = now()
         where id = $1
         returning id, name, suspended_at`,
        [id, Boolean(body.suspended)],
      );
      const profile = result.rows[0];
      if (!profile) throw new BadRequestException("User not found.");
      const email = await this.database.query<{ email: string }>(
        "select email from users where id = $1",
        [id],
      );
      await this.audit.record({
        actorId: support.userId,
        action: body.suspended ? "user.suspended" : "user.reactivated",
        targetType: "profile",
        targetId: id,
        correlationId: request.correlationId,
      });
      return { ...profile, email: email.rows[0]?.email ?? "" };
    });
  }

  @Get("templates")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async templates(@Req() request: AuthenticatedRequest) {
    await requireAdminPortal(request, this.database);
    const result = await this.database.query(
      `select id, slug, name, description, category, habit_type, icon,
              default_target::float8 as default_target, default_unit,
              default_frequency, active, created_at, updated_at
       from habit_templates
       order by category, name`,
    );
    return result.rows;
  }

  @Post("templates")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const support = await requireAdminPortal(request, this.database);
    return this.idempotent(request, "POST:/admin/templates", async () => {
      const result = await this.database.query(
        `insert into habit_templates (
           slug, name, description, category, habit_type, icon,
           default_target, default_unit, default_frequency, active
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         returning id, slug, name, description, category, habit_type, icon,
                   default_target::float8 as default_target, default_unit,
                   default_frequency, active, created_at, updated_at`,
        [
          requiredString(body.slug, "slug"),
          requiredString(body.name, "name"),
          optionalString(body.description) ?? "",
          requiredString(body.category, "category"),
          requiredString(body.habit_type, "habit_type"),
          requiredString(body.icon, "icon"),
          optionalNumber(body.default_target),
          optionalString(body.default_unit),
          JSON.stringify(body.default_frequency ?? { kind: "daily" }),
          body.active === undefined ? true : Boolean(body.active),
        ],
      );
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
    @Body() body: Record<string, unknown>,
  ) {
    const support = await requireAdminPortal(request, this.database);
    return this.idempotent(request, `PATCH:/admin/templates/${id}`, async () => {
      const allowed = [
        "name",
        "description",
        "icon",
        "default_target",
        "default_unit",
        "active",
      ] as const;
      const entries = allowed
        .filter((key) => Object.hasOwn(body, key))
        .map((key) => [key, body[key]] as const);
      if (!entries.length) throw new BadRequestException("No supported fields were provided.");
      const assignments = entries
        .map(([key], index) => `${key} = $${index + 2}`)
        .join(", ");
      const result = await this.database.query(
        `update habit_templates
         set ${assignments}, updated_at = now()
         where id = $1
         returning id, slug, name, description, category, habit_type, icon,
                   default_target::float8 as default_target, default_unit,
                   default_frequency, active, created_at, updated_at`,
        [id, ...entries.map(([, value]) => value)],
      );
      const template = result.rows[0];
      if (!template) throw new BadRequestException("Template not found.");
      await this.audit.record({
        actorId: support.userId,
        action: "template.updated",
        targetType: "habit_template",
        targetId: id,
        correlationId: request.correlationId,
        metadata: { fields: entries.map(([key]) => key) },
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
    const support = await requireAdminPortal(request, this.database);
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

  @Post("announcements")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async announcement(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const support = await requireAdminPortal(request, this.database);
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

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${name} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new BadRequestException("Expected text.");
  return value;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestException("Expected a number.");
  }
  return value;
}
