import type { Transaction } from '@op-engineering/op-sqlite';
import { currentDatabase } from '@/database/database';

type Snapshot = {
  profile: Record<string, unknown> | null;
  templates: Record<string, unknown>[];
  habits: Record<string, unknown>[];
  habitLogs: Record<string, unknown>[];
  journals: Record<string, unknown>[];
  prayerLogs: Record<string, unknown>[];
  habitReminders: Record<string, unknown>[];
  prayerReminders: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
};

type Change = {
  entityType: string;
  entityId: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
};

export async function applyInitialSnapshot(snapshot: Snapshot) {
  await currentDatabase().transaction(async (tx) => {
    for (const table of [
      'profile',
      'preferences',
      'habit_templates',
      'habits',
      'habit_logs',
      'journals',
      'prayer_logs',
      'habit_reminders',
      'prayer_reminders',
      'notifications',
    ]) {
      await tx.execute(`delete from ${table}`);
    }
    if (snapshot.profile) await applyProfile(tx, snapshot.profile);
    for (const row of snapshot.templates) await applyTemplate(tx, row);
    for (const row of snapshot.habits) await applyHabit(tx, row);
    for (const row of snapshot.habitLogs) await applyHabitLog(tx, row);
    for (const row of snapshot.journals) await applyJournal(tx, row);
    for (const row of snapshot.prayerLogs) await applyPrayerLog(tx, row);
    for (const row of snapshot.habitReminders) {
      await applyHabitReminder(tx, row);
    }
    for (const row of snapshot.prayerReminders) {
      await applyPrayerReminder(tx, row);
    }
    for (const row of snapshot.notifications) await applyNotification(tx, row);
  });
}

export async function applyChanges(changes: Change[]) {
  await currentDatabase().transaction(async (tx) => {
    for (const change of changes) {
      if (change.operation === 'delete' || !change.payload) {
        await removeRemote(tx, change.entityType, change.entityId);
      } else {
        await applyRemoteRow(tx, change.entityType, change.payload);
      }
    }
  });
}

async function applyRemoteRow(
  tx: Transaction,
  entityType: string,
  row: Record<string, unknown>
) {
  if (entityType === 'profile') return applyProfile(tx, row);
  if (entityType === 'habit') return applyHabit(tx, row);
  if (entityType === 'habit_log') return applyHabitLog(tx, row);
  if (entityType === 'journal') return applyJournal(tx, row);
  if (entityType === 'prayer_log') return applyPrayerLog(tx, row);
  if (entityType === 'habit_reminder') return applyHabitReminder(tx, row);
  if (entityType === 'prayer_reminder') return applyPrayerReminder(tx, row);
  if (entityType === 'notification') return applyNotification(tx, row);
}

async function applyProfile(tx: Transaction, row: Record<string, unknown>) {
  const id = string(row.id);
  const modified = iso(row.client_modified_at ?? row.updated_at);
  const mutation = string(row.last_mutation_id, 'server');
  await tx.execute(
    `insert into profile (
      id,email,name,timezone,units,avatar_uri,onboarding_completed_at,
      client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?,?,?)
    on conflict(id) do update set email=excluded.email,name=excluded.name,
    timezone=excluded.timezone,units=excluded.units,
    avatar_uri=excluded.avatar_uri,
    onboarding_completed_at=excluded.onboarding_completed_at,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      id,
      string(row.email),
      string(row.name),
      string(row.timezone, 'UTC'),
      string(row.units, 'metric'),
      nullableString(row.avatar_uri ?? row.avatar_url),
      nullableString(row.onboarding_completed_at),
      modified,
      mutation,
    ]
  );
  await tx.execute(
    `insert into preferences (
      user_id,goals,pace,daily_digest_time,daily_digest_enabled,religion,
      latitude,longitude,madhab,calculation_method,
      client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(user_id) do update set goals=excluded.goals,pace=excluded.pace,
    daily_digest_time=excluded.daily_digest_time,
    daily_digest_enabled=excluded.daily_digest_enabled,
    religion=excluded.religion,latitude=excluded.latitude,
    longitude=excluded.longitude,madhab=excluded.madhab,
    calculation_method=excluded.calculation_method,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      id,
      json(row.goal_preferences ?? []),
      string(row.starting_pace, 'balanced'),
      time(row.daily_digest_time, '20:00'),
      bool(row.daily_digest_enabled),
      string(row.religion_preference, 'unspecified'),
      numberOrNull(row.latitude),
      numberOrNull(row.longitude),
      nullableString(row.madhab),
      nullableString(row.prayer_calculation_method),
      modified,
      mutation,
    ]
  );
}

async function applyTemplate(tx: Transaction, row: Record<string, unknown>) {
  await tx.execute(
    `insert or replace into habit_templates (
      id,slug,name,description,category,habit_type,icon,default_target,
      default_unit,default_frequency,goal_tags,recommendation_priority,updated_at
    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      string(row.id),
      string(row.slug),
      string(row.name),
      string(row.description),
      string(row.category),
      string(row.habit_type),
      string(row.icon),
      numberOrNull(row.default_target),
      nullableString(row.default_unit),
      json(row.default_frequency ?? { kind: 'daily' }),
      json(row.goal_tags ?? []),
      Number(row.recommendation_priority ?? 100),
      iso(row.updated_at),
    ]
  );
}

async function applyHabit(tx: Transaction, row: Record<string, unknown>) {
  await tx.execute(
    `insert into habits (
      id,template_id,name,icon,category,habit_type,target,unit,frequency,
      forgiving,state,deleted_at,client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(id) do update set template_id=excluded.template_id,
    name=excluded.name,icon=excluded.icon,category=excluded.category,
    habit_type=excluded.habit_type,target=excluded.target,unit=excluded.unit,
    frequency=excluded.frequency,forgiving=excluded.forgiving,
    state=excluded.state,deleted_at=excluded.deleted_at,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      string(row.id),
      nullableString(row.template_id),
      string(row.name),
      string(row.icon),
      string(row.category),
      string(row.habit_type),
      numberOrNull(row.target),
      nullableString(row.unit),
      json(row.frequency ?? { kind: 'daily' }),
      bool(row.forgiving),
      string(row.state, 'active'),
      nullableString(row.deleted_at),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyHabitLog(tx: Transaction, row: Record<string, unknown>) {
  await tx.execute(
    'delete from habit_logs where habit_id=? and local_date=? and id<>?',
    [string(row.habit_id), date(row.local_date), string(row.id)]
  );
  await tx.execute(
    `insert into habit_logs (
      id,habit_id,local_date,status,value,note,prayer_status,deleted_at,
      client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?,?,?,?)
    on conflict(id) do update set status=excluded.status,value=excluded.value,
    note=excluded.note,prayer_status=excluded.prayer_status,
    deleted_at=excluded.deleted_at,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      string(row.id),
      string(row.habit_id),
      date(row.local_date),
      string(row.status),
      numberOrNull(row.value),
      nullableString(row.note),
      nullableString(row.prayer_status),
      nullableString(row.deleted_at),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyJournal(tx: Transaction, row: Record<string, unknown>) {
  await tx.execute('delete from journals where local_date=? and id<>?', [
    date(row.local_date),
    string(row.id),
  ]);
  await tx.execute(
    `insert into journals (
      id,local_date,win_note,reflection_note,client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?)
    on conflict(id) do update set win_note=excluded.win_note,
    reflection_note=excluded.reflection_note,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      string(row.id),
      date(row.local_date),
      nullableString(row.win_note),
      nullableString(row.reflection_note),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyPrayerLog(tx: Transaction, row: Record<string, unknown>) {
  await tx.execute(
    `delete from prayer_logs
     where local_date=? and prayer_name=? and id<>?`,
    [date(row.local_date), string(row.prayer_name), string(row.id)]
  );
  await tx.execute(
    `insert into prayer_logs (
      id,local_date,prayer_name,status,deleted_at,
      client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?)
    on conflict(id) do update set status=excluded.status,
    deleted_at=excluded.deleted_at,
    client_modified_at=excluded.client_modified_at,
    last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      string(row.id),
      date(row.local_date),
      string(row.prayer_name),
      string(row.status),
      nullableString(row.deleted_at),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyHabitReminder(
  tx: Transaction,
  row: Record<string, unknown>
) {
  await tx.execute(
    `insert or replace into habit_reminders (
      habit_id,enabled,time_local,client_modified_at,last_mutation_id
    ) values (?,?,?,?,?)`,
    [
      string(row.habit_id),
      bool(row.enabled),
      time(row.time_local),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyPrayerReminder(
  tx: Transaction,
  row: Record<string, unknown>
) {
  await tx.execute(
    `insert or replace into prayer_reminders (
      prayer_name,enabled,offset_minutes,client_modified_at,last_mutation_id
    ) values (?,?,?,?,?)`,
    [
      string(row.prayer_name),
      bool(row.enabled),
      Number(row.offset_minutes ?? 0),
      iso(row.client_modified_at ?? row.updated_at),
      string(row.last_mutation_id, 'server'),
    ]
  );
}

async function applyNotification(
  tx: Transaction,
  row: Record<string, unknown>
) {
  await tx.execute(
    `insert or replace into notifications (
      id,title,body,metadata,state,scheduled_at,sent_at,updated_at
    ) values (?,?,?,?,?,?,?,?)`,
    [
      string(row.id),
      string(row.title),
      string(row.body),
      json(row.metadata ?? {}),
      string(row.state),
      iso(row.scheduled_at),
      nullableString(row.sent_at),
      iso(row.updated_at ?? row.created_at),
    ]
  );
}

async function removeRemote(
  tx: Transaction,
  entityType: string,
  entityId: string
) {
  const target = {
    habit: ['habits', 'id'],
    habit_log: ['habit_logs', 'id'],
    journal: ['journals', 'id'],
    prayer_log: ['prayer_logs', 'id'],
    habit_reminder: ['habit_reminders', 'habit_id'],
    prayer_reminder: ['prayer_reminders', 'prayer_name'],
    notification: ['notifications', 'id'],
  }[entityType];
  if (target) {
    await tx.execute(`delete from ${target[0]} where ${target[1]}=?`, [
      entityId,
    ]);
  }
}

function string(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown) {
  return value ? 1 : 0;
}

function json(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function date(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function time(value: unknown, fallback: string | null = null) {
  return typeof value === 'string' ? value.slice(0, 5) : fallback;
}
