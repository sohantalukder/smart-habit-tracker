import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  checkInSchema,
  createHabitSchema,
  firebaseInstallationSchema,
  habitReminderSchema,
  journalSchema,
  onboardingSchema,
  prayerCheckInSchema,
  prayerNameSchema,
  preferencesSchema,
  profileUpdateSchema,
  type SyncMutationInput,
  type SyncPushInput,
} from "../contracts";
import {
  DatabaseService,
  type DatabaseClient,
} from "../platform/database.service";

type MutationStatus = "applied" | "superseded" | "retryable" | "rejected";
type MutationResult = {
  mutationId: string;
  status: MutationStatus;
  canonical?: unknown;
  code?: string;
  message?: string;
};
type Metadata = {
  client_modified_at: Date | string;
  last_mutation_id: string;
};

const localDateSchema = z.iso.date();
const habitLogPayloadSchema = checkInSchema.extend({
  habitId: z.uuid(),
  localDate: localDateSchema,
});
const journalPayloadSchema = journalSchema.extend({ localDate: localDateSchema });
const prayerLogPayloadSchema = prayerCheckInSchema.extend({
  prayer: prayerNameSchema,
  localDate: localDateSchema,
});
const habitReminderPayloadSchema = habitReminderSchema.and(
  z.object({ habitId: z.uuid() }),
);
const prayerReminderPayloadSchema = z.object({
  prayer: prayerNameSchema,
  enabled: z.boolean(),
  offsetMinutes: z.number().int().min(0).max(120),
});

@Injectable()
export class SyncService {
  constructor(private readonly database: DatabaseService) {}

  async push(userId: string, input: SyncPushInput) {
    const results: MutationResult[] = [];
    for (const mutation of input.mutations) {
      try {
        results.push(
          await this.database.transaction((client) =>
            this.process(client, userId, input.deviceId, mutation)
          ),
        );
      } catch (error) {
        results.push({
          mutationId: mutation.mutationId,
          status: "retryable",
          code: "SYNC_TEMPORARY_FAILURE",
          message: error instanceof Error ? error.message : "Sync failed temporarily.",
        });
      }
    }
    return { results, serverTime: new Date().toISOString() };
  }

  async pull(userId: string, rawCursor: string | undefined, limit: number) {
    const cursor = decodeSyncCursor(rawCursor);
    if (rawCursor === undefined) {
      const snapshot = await this.snapshot(userId);
      const latest = await this.database.query<{ sequence: string }>(
        `select coalesce(max(sequence), 0)::text as sequence
         from sync_change_log where user_id = $1`,
        [userId],
      );
      return {
        snapshot,
        changes: [],
        nextCursor: encodeSyncCursor(latest.rows[0]?.sequence ?? "0"),
        hasMore: false,
        serverTime: new Date().toISOString(),
      };
    }

    const changes = await this.database.query<{
      sequence: string;
      entity_type: string;
      entity_id: string;
      operation: "upsert" | "delete";
      payload: unknown;
      changed_at: Date;
    }>(
      `select sequence::text, entity_type, entity_id, operation, payload, changed_at
       from sync_change_log
       where user_id = $1 and sequence > $2::bigint
       order by sequence
       limit $3`,
      [userId, cursor, limit + 1],
    );
    const page = changes.rows.slice(0, limit);
    const next = page.at(-1)?.sequence ?? cursor;
    return {
      changes: page.map((change) => ({
        sequence: change.sequence,
        entityType: change.entity_type,
        entityId: change.entity_id,
        operation: change.operation,
        payload: change.payload,
        changedAt: change.changed_at,
      })),
      nextCursor: encodeSyncCursor(next),
      hasMore: changes.rows.length > limit,
      serverTime: new Date().toISOString(),
    };
  }

  private async process(
    client: DatabaseClient,
    userId: string,
    deviceId: string,
    mutation: SyncMutationInput,
  ): Promise<MutationResult> {
    const processed = await client.query<{ response: MutationResult }>(
      `select response from sync_processed_mutations
       where user_id = $1 and mutation_id = $2`,
      [userId, mutation.mutationId],
    );
    if (processed.rows[0]) return processed.rows[0].response;

    const timestamp = clampClientTimestamp(mutation.clientModifiedAt);
    const current = await this.metadata(client, userId, mutation);
    if (current && compareSyncVersion(
      current.client_modified_at,
      current.last_mutation_id,
      timestamp,
      mutation.mutationId,
    ) > 0) {
      const result: MutationResult = {
        mutationId: mutation.mutationId,
        status: "superseded",
        canonical: await this.canonical(client, userId, mutation),
      };
      await this.remember(client, userId, deviceId, result);
      return result;
    }

    let result: MutationResult;
    try {
      const canonical = mutation.operation === "delete"
        ? await this.remove(client, userId, mutation, timestamp)
        : await this.upsert(client, userId, mutation, timestamp);
      result = { mutationId: mutation.mutationId, status: "applied", canonical };
    } catch (error) {
      if (!(error instanceof z.ZodError) && !isUserInputDatabaseError(error)) {
        throw error;
      }
      result = {
        mutationId: mutation.mutationId,
        status: "rejected",
        code: "SYNC_MUTATION_INVALID",
        message: error instanceof Error ? error.message : "Mutation is invalid.",
      };
    }
    await this.remember(client, userId, deviceId, result);
    return result;
  }

  private async metadata(
    client: DatabaseClient,
    userId: string,
    mutation: SyncMutationInput,
  ): Promise<Metadata | undefined> {
    const tombstone = await client.query<Metadata>(
      `select client_modified_at, last_mutation_id
       from sync_tombstones
       where user_id = $1 and entity_type = $2 and entity_id = $3`,
      [userId, mutation.entityType, mutation.entityId],
    );
    const table = metadataTable(mutation.entityType);
    if (!table) return tombstone.rows[0];
    if (mutation.operation === "upsert" && mutation.entityType === "habit_log") {
      const value = habitLogPayloadSchema.parse(mutation.payload);
      const record = await client.query<Metadata>(
        `select client_modified_at,last_mutation_id from habit_daily_logs
         where user_id=$1 and habit_id=$2 and local_date=$3::date`,
        [userId, value.habitId, value.localDate],
      );
      return newestMetadata(record.rows[0], tombstone.rows[0]);
    }
    if (mutation.operation === "upsert" && mutation.entityType === "journal") {
      const value = journalPayloadSchema.parse(mutation.payload);
      const record = await client.query<Metadata>(
        `select client_modified_at,last_mutation_id from daily_journals
         where user_id=$1 and local_date=$2::date`,
        [userId, value.localDate],
      );
      return newestMetadata(record.rows[0], tombstone.rows[0]);
    }
    if (mutation.operation === "upsert" && mutation.entityType === "prayer_log") {
      const value = prayerLogPayloadSchema.parse(mutation.payload);
      const record = await client.query<Metadata>(
        `select client_modified_at,last_mutation_id from prayer_logs
         where user_id=$1 and local_date=$2::date and prayer_name=$3`,
        [userId, value.localDate, value.prayer],
      );
      return newestMetadata(record.rows[0], tombstone.rows[0]);
    }
    const idColumn = mutation.entityType === "profile"
      || mutation.entityType === "preferences"
      || mutation.entityType === "onboarding"
      ? "id"
      : mutation.entityType === "habit_reminder"
      ? "habit_id"
      : mutation.entityType === "prayer_reminder"
      ? "prayer_name"
      : "id";
    const entityId = idColumn === "id" && table === "profiles"
      ? userId
      : mutation.entityId;
    const owner = table === "profiles" ? "" : " and user_id = $2";
    const values = table === "profiles" ? [entityId] : [entityId, userId];
    const record = await client.query<Metadata>(
      `select client_modified_at, last_mutation_id
       from ${table} where ${idColumn} = $1${owner}`,
      values,
    );
    return newestMetadata(record.rows[0], tombstone.rows[0]);
  }

  private async upsert(
    client: DatabaseClient,
    userId: string,
    mutation: SyncMutationInput,
    timestamp: Date,
  ) {
    const metadata = [timestamp, mutation.mutationId] as const;
    switch (mutation.entityType) {
      case "profile": {
        const value = profileUpdateSchema.parse(mutation.payload);
        const result = await client.query(
          `update profiles set name = $2, timezone = $3, units = $4,
             updated_at = now(), client_modified_at = $5,
             last_mutation_id = $6 where id = $1 returning *`,
          [userId, value.name, value.timezone, value.units, ...metadata],
        );
        return result.rows[0];
      }
      case "preferences": {
        const value = preferencesSchema.parse(mutation.payload);
        await updatePreferences(client, userId, value, metadata);
        return (await client.query("select * from profiles where id = $1", [userId]))
          .rows[0];
      }
      case "onboarding": {
        const value = onboardingSchema.parse(mutation.payload);
        await updatePreferences(client, userId, value, metadata);
        await client.query(
          `update profiles set name = $2, units = $3,
             onboarding_completed_at = coalesce(onboarding_completed_at, now()),
             updated_at = now(), client_modified_at = $4,
             last_mutation_id = $5 where id = $1`,
          [userId, value.name, value.units, ...metadata],
        );
        await client.query(
          `insert into habits (
             id, user_id, template_id, name, icon, category, habit_type,
             target, unit, frequency, client_modified_at, last_mutation_id
           )
           select gen_random_uuid(), $1, t.id, t.name, t.icon, t.category,
                  t.habit_type, t.default_target, t.default_unit,
                  t.default_frequency, $3, $4
           from habit_templates t where t.id = any($2::uuid[]) and t.active = true
           on conflict (user_id, template_id)
             where template_id is not null and deleted_at is null do nothing`,
          [userId, value.templateIds, ...metadata],
        );
        return { completed: true };
      }
      case "habit": {
        const value = createHabitSchema.parse({
          ...mutation.payload,
          id: mutation.entityId,
        });
        if ("templateId" in value) {
          const result = await client.query(
            `insert into habits (
               id, user_id, template_id, name, icon, category, habit_type,
               target, unit, frequency, client_modified_at, last_mutation_id
             )
             select $1, $2, t.id, t.name, t.icon, t.category, t.habit_type,
                    t.default_target, t.default_unit, t.default_frequency, $4, $5
             from habit_templates t where t.id = $3 and t.active = true
             on conflict (id) do update set deleted_at = null, state = 'active',
               updated_at = now(), client_modified_at = excluded.client_modified_at,
               last_mutation_id = excluded.last_mutation_id
             returning *`,
            [mutation.entityId, userId, value.templateId, ...metadata],
          );
          if (!result.rows[0]) throw new Error("Habit template is unavailable.");
          return result.rows[0];
        }
        const result = await client.query(
          `insert into habits (
             id, user_id, name, icon, category, habit_type, target, unit,
             frequency, forgiving, client_modified_at, last_mutation_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
           on conflict (id) do update set
             name=excluded.name, icon=excluded.icon, category=excluded.category,
             habit_type=excluded.habit_type, target=excluded.target,
             unit=excluded.unit, frequency=excluded.frequency,
             forgiving=excluded.forgiving, deleted_at=null, updated_at=now(),
             client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id
           where habits.user_id = $2 returning *`,
          [
            mutation.entityId,
            userId,
            value.name,
            value.icon,
            value.category,
            value.type,
            value.target,
            value.unit,
            JSON.stringify(value.frequency),
            value.forgiving,
            ...metadata,
          ],
        );
        if (!result.rows[0]) throw new Error("Habit does not belong to this user.");
        return result.rows[0];
      }
      case "habit_log": {
        const value = habitLogPayloadSchema.parse(mutation.payload);
        await assertHabitOwner(client, userId, value.habitId);
        const result = await client.query(
          `insert into habit_daily_logs (
             id, habit_id, user_id, local_date, status, value, note,
             prayer_status, idempotency_key, client_modified_at, last_mutation_id
           ) values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11)
           on conflict (habit_id, local_date) do update set
             status=excluded.status, value=excluded.value, note=excluded.note,
             prayer_status=excluded.prayer_status, deleted_at=null,
             updated_at=now(), client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id returning *`,
          [
            mutation.entityId,
            value.habitId,
            userId,
            value.localDate,
            value.status,
            value.value,
            value.note,
            value.prayerStatus,
            mutation.mutationId,
            ...metadata,
          ],
        );
        return result.rows[0];
      }
      case "journal": {
        const value = journalPayloadSchema.parse(mutation.payload);
        const result = await client.query(
          `insert into daily_journals (
             id,user_id,local_date,win_note,reflection_note,
             client_modified_at,last_mutation_id
           ) values ($1,$2,$3::date,$4,$5,$6,$7)
           on conflict (user_id,local_date) do update set
             win_note=excluded.win_note, reflection_note=excluded.reflection_note,
             updated_at=now(), client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id returning *`,
          [
            mutation.entityId,
            userId,
            value.localDate,
            value.winNote,
            value.reflectionNote,
            ...metadata,
          ],
        );
        return result.rows[0];
      }
      case "prayer_log": {
        const value = prayerLogPayloadSchema.parse(mutation.payload);
        const result = await client.query(
          `insert into prayer_logs (
             id,user_id,local_date,prayer_name,status,idempotency_key,
             client_modified_at,last_mutation_id
           ) values ($1,$2,$3::date,$4,$5,$6,$7,$8)
           on conflict (user_id,local_date,prayer_name) do update set
             status=excluded.status, deleted_at=null, updated_at=now(),
             client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id returning *`,
          [
            mutation.entityId,
            userId,
            value.localDate,
            value.prayer,
            value.status,
            mutation.mutationId,
            ...metadata,
          ],
        );
        return result.rows[0];
      }
      case "habit_reminder": {
        const value = habitReminderPayloadSchema.parse(mutation.payload);
        await assertHabitOwner(client, userId, value.habitId);
        if (!value.enabled) {
          return this.remove(client, userId, mutation, timestamp);
        }
        const result = await client.query(
          `insert into habit_reminders (
             habit_id,user_id,enabled,time_local,client_modified_at,last_mutation_id
           ) values ($1,$2,true,$3::time,$4,$5)
           on conflict (habit_id) do update set enabled=true,
             time_local=excluded.time_local, updated_at=now(),
             client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id returning *`,
          [value.habitId, userId, value.time, ...metadata],
        );
        return result.rows[0];
      }
      case "prayer_reminder": {
        const value = prayerReminderPayloadSchema.parse(mutation.payload);
        const result = await client.query(
          `insert into prayer_reminder_settings (
             user_id,prayer_name,enabled,offset_minutes,
             client_modified_at,last_mutation_id
           ) values ($1,$2,$3,$4,$5,$6)
           on conflict (user_id,prayer_name) do update set
             enabled=excluded.enabled, offset_minutes=excluded.offset_minutes,
             updated_at=now(), client_modified_at=excluded.client_modified_at,
             last_mutation_id=excluded.last_mutation_id returning *`,
          [
            userId,
            value.prayer,
            value.enabled,
            value.offsetMinutes,
            ...metadata,
          ],
        );
        return result.rows[0];
      }
      case "push_installation": {
        const value = firebaseInstallationSchema.parse(mutation.payload);
        if (value.pushToken) {
          await client.query(
            `update firebase_installations set active=false, updated_at=now()
             where push_token=$1 and installation_id<>$2`,
            [value.pushToken, value.installationId],
          );
        }
        const result = await client.query(
          `insert into firebase_installations (
             user_id,installation_id,platform,push_token,active
           ) values ($1,$2,$3,$4,true)
           on conflict (installation_id) do update set user_id=excluded.user_id,
             platform=excluded.platform,push_token=excluded.push_token,
             active=true,last_seen_at=now(),updated_at=now() returning *`,
          [userId, value.installationId, value.platform, value.pushToken ?? null],
        );
        return result.rows[0];
      }
    }
  }

  private async remove(
    client: DatabaseClient,
    userId: string,
    mutation: SyncMutationInput,
    timestamp: Date,
  ) {
    const metadata = [timestamp, mutation.mutationId] as const;
    switch (mutation.entityType) {
      case "habit":
        await client.query(
          `update habits set deleted_at=now(),updated_at=now(),
             client_modified_at=$3,last_mutation_id=$4
           where id=$1 and user_id=$2`,
          [mutation.entityId, userId, ...metadata],
        );
        break;
      case "habit_log":
        await client.query(
          `update habit_daily_logs set deleted_at=now(),updated_at=now(),
             client_modified_at=$3,last_mutation_id=$4
           where id=$1 and user_id=$2`,
          [mutation.entityId, userId, ...metadata],
        );
        break;
      case "prayer_log":
        await client.query(
          `update prayer_logs set deleted_at=now(),updated_at=now(),
             client_modified_at=$3,last_mutation_id=$4
           where id=$1 and user_id=$2`,
          [mutation.entityId, userId, ...metadata],
        );
        break;
      case "journal":
        await client.query(
          "delete from daily_journals where id=$1 and user_id=$2",
          [mutation.entityId, userId],
        );
        break;
      case "habit_reminder":
        await client.query(
          "delete from habit_reminders where habit_id=$1 and user_id=$2",
          [mutation.entityId, userId],
        );
        break;
      case "prayer_reminder":
        await client.query(
          `delete from prayer_reminder_settings
           where prayer_name=$1 and user_id=$2`,
          [mutation.entityId, userId],
        );
        break;
      case "push_installation":
        await client.query(
          `update firebase_installations set active=false,updated_at=now()
           where installation_id=$1 and user_id=$2`,
          [mutation.entityId, userId],
        );
        break;
      default:
        throw new z.ZodError([{
          code: "custom",
          path: ["operation"],
          message: `${mutation.entityType} cannot be deleted.`,
        }]);
    }
    await client.query(
      `insert into sync_tombstones (
         user_id,entity_type,entity_id,client_modified_at,last_mutation_id
       ) values ($1,$2,$3,$4,$5)
       on conflict (user_id,entity_type,entity_id) do update set
         client_modified_at=excluded.client_modified_at,
         last_mutation_id=excluded.last_mutation_id,deleted_at=now()`,
      [userId, mutation.entityType, mutation.entityId, ...metadata],
    );
    return null;
  }

  private async canonical(
    client: DatabaseClient,
    userId: string,
    mutation: SyncMutationInput,
  ) {
    const table = metadataTable(mutation.entityType);
    if (!table || mutation.entityType === "onboarding") return null;
    const idColumn = mutation.entityType === "profile"
      || mutation.entityType === "preferences"
      ? "id"
      : mutation.entityType === "habit_reminder"
      ? "habit_id"
      : mutation.entityType === "prayer_reminder"
      ? "prayer_name"
      : "id";
    const entityId = table === "profiles" ? userId : mutation.entityId;
    const owner = table === "profiles" ? "" : " and user_id=$2";
    const result = await client.query(
      `select * from ${table} where ${idColumn}=$1${owner}`,
      table === "profiles" ? [entityId] : [entityId, userId],
    );
    return result.rows[0] ?? null;
  }

  private remember(
    client: DatabaseClient,
    userId: string,
    deviceId: string,
    result: MutationResult,
  ) {
    return client.query(
      `insert into sync_processed_mutations (
         user_id,mutation_id,device_id,status,response
       ) values ($1,$2,$3,$4,$5::jsonb)`,
      [userId, result.mutationId, deviceId, result.status, JSON.stringify(result)],
    );
  }

  private async snapshot(userId: string) {
    const [
      profile,
      templates,
      habits,
      habitLogs,
      journals,
      prayerLogs,
      habitReminders,
      prayerReminders,
      notifications,
    ] = await Promise.all([
      this.database.query(
        `select p.*,u.email from profiles p join users u on u.id=p.id
         where p.id=$1`,
        [userId],
      ),
      this.database.query(
        `select * from habit_templates where active=true
         order by recommendation_priority,category,name`,
      ),
      this.database.query("select * from habits where user_id=$1", [userId]),
      this.database.query(
        "select * from habit_daily_logs where user_id=$1",
        [userId],
      ),
      this.database.query("select * from daily_journals where user_id=$1", [userId]),
      this.database.query("select * from prayer_logs where user_id=$1", [userId]),
      this.database.query("select * from habit_reminders where user_id=$1", [userId]),
      this.database.query(
        "select * from prayer_reminder_settings where user_id=$1",
        [userId],
      ),
      this.database.query(
        `select * from notification_deliveries
         where user_id=$1 and channel='in_app'
         order by created_at desc limit 100`,
        [userId],
      ),
    ]);
    return {
      profile: profile.rows[0] ?? null,
      templates: templates.rows,
      habits: habits.rows,
      habitLogs: habitLogs.rows,
      journals: journals.rows,
      prayerLogs: prayerLogs.rows,
      habitReminders: habitReminders.rows,
      prayerReminders: prayerReminders.rows,
      notifications: notifications.rows,
    };
  }
}

function metadataTable(entityType: SyncMutationInput["entityType"]) {
  return {
    profile: "profiles",
    preferences: "profiles",
    onboarding: "profiles",
    habit: "habits",
    habit_log: "habit_daily_logs",
    journal: "daily_journals",
    prayer_log: "prayer_logs",
    habit_reminder: "habit_reminders",
    prayer_reminder: "prayer_reminder_settings",
    push_installation: null,
  }[entityType];
}

async function assertHabitOwner(
  client: DatabaseClient,
  userId: string,
  habitId: string,
) {
  const result = await client.query(
    "select id from habits where id=$1 and user_id=$2 and deleted_at is null",
    [habitId, userId],
  );
  if (!result.rows[0]) throw new Error("Habit not found.");
}

async function updatePreferences(
  client: DatabaseClient,
  userId: string,
  value: z.infer<typeof preferencesSchema> | z.infer<typeof onboardingSchema>,
  metadata: readonly [Date, string],
) {
  const setup = value.religion === "muslim" ? value.prayerSetup : null;
  await client.query(
    `update profiles set goal_preferences=$2::text[],starting_pace=$3,
       religion_preference=$4,daily_digest_time=$5::time,
       daily_digest_enabled=$6,prayer_enabled=$7,latitude=$8,longitude=$9,
       location_updated_at=case when $8::numeric is null then null else now() end,
       timezone=coalesce($10,timezone),madhab=$11,
       prayer_calculation_method=$12,updated_at=now(),
       client_modified_at=$13,last_mutation_id=$14 where id=$1`,
    [
      userId,
      value.goals,
      value.pace,
      value.religion,
      value.dailyDigestTime,
      value.dailyDigestEnabled,
      Boolean(setup),
      setup?.latitude ?? null,
      setup?.longitude ?? null,
      setup?.timezone ?? null,
      setup?.madhab ?? null,
      setup?.calculationMethod ?? null,
      ...metadata,
    ],
  );
  if (!setup) {
    await client.query(
      "delete from prayer_reminder_settings where user_id=$1",
      [userId],
    );
    return;
  }
  for (const reminder of setup.reminders) {
    await client.query(
      `insert into prayer_reminder_settings (
         user_id,prayer_name,enabled,offset_minutes,
         client_modified_at,last_mutation_id
       ) values ($1,$2,$3,$4,$5,$6)
       on conflict (user_id,prayer_name) do update set
         enabled=excluded.enabled,offset_minutes=excluded.offset_minutes,
         updated_at=now(),client_modified_at=excluded.client_modified_at,
         last_mutation_id=excluded.last_mutation_id`,
      [
        userId,
        reminder.prayer,
        reminder.enabled,
        reminder.offsetMinutes,
        ...metadata,
      ],
    );
  }
}

export function compareSyncVersion(
  leftTime: Date | string,
  leftId: string,
  rightTime: Date | string,
  rightId: string,
) {
  const difference = new Date(leftTime).getTime() - new Date(rightTime).getTime();
  return difference || leftId.localeCompare(rightId);
}

export function clampClientTimestamp(value: string) {
  const requested = new Date(value);
  const maximum = Date.now() + 5 * 60 * 1000;
  return requested.getTime() > maximum ? new Date(maximum) : requested;
}

export function encodeSyncCursor(sequence: string) {
  return Buffer.from(`v1:${sequence}`).toString("base64url");
}

export function decodeSyncCursor(value: string | undefined) {
  if (value === undefined) return "0";
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (!/^v1:\d+$/.test(decoded)) throw new Error();
    return decoded.slice(3);
  } catch {
    throw new BadRequestException("Sync cursor is invalid.");
  }
}

function newestMetadata(
  ...values: (Metadata | undefined)[]
): Metadata | undefined {
  return values.filter((item): item is Metadata => Boolean(item)).sort((a, b) =>
    compareSyncVersion(
      b.client_modified_at,
      b.last_mutation_id,
      a.client_modified_at,
      a.last_mutation_id,
    )
  )[0];
}

function isUserInputDatabaseError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error
      && ["22001", "22007", "22P02", "23502", "23503", "23505", "23514"].includes(
        String(error.code),
      ),
  );
}
