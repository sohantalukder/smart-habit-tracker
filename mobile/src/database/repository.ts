import 'react-native-get-random-values';
import type { Transaction } from '@op-engineering/op-sqlite';
import { v4 as uuid } from 'uuid';
import type {
  Habit,
  HabitLog,
  MutationEntity,
  SyncMutation,
} from '@/core/models';
import { currentDatabase, first, rows } from './database';

type HabitDraft = {
  templateId?: string;
  name: string;
  icon: string;
  category: string;
  type: Habit['habit_type'];
  target: number | null;
  unit: string | null;
  frequency: Record<string, unknown>;
  forgiving: boolean;
};

export async function createHabit(draft: HabitDraft) {
  const id = uuid();
  const version = mutationVersion();
  const payload = draft.templateId
    ? { id, templateId: draft.templateId }
    : { id, ...draft };
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into habits (
        id,template_id,name,icon,category,habit_type,target,unit,frequency,
        forgiving,state,client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?,?,?,?,?, 'active',?,?)`,
      [
        id,
        draft.templateId ?? null,
        draft.name,
        draft.icon,
        draft.category,
        draft.type,
        draft.target,
        draft.unit,
        JSON.stringify(draft.frequency),
        draft.forgiving ? 1 : 0,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'habit',
      entityId: id,
      operation: 'upsert',
      payload,
    });
  });
  return id;
}

export async function deleteHabit(habitId: string) {
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `update habits set deleted_at=?,client_modified_at=?,
       last_mutation_id=?,sync_error=null where id=?`,
      [
        version.clientModifiedAt,
        version.clientModifiedAt,
        version.mutationId,
        habitId,
      ]
    );
    await tx.execute(
      `insert into tombstones(entity_type,entity_id,client_modified_at,mutation_id)
       values('habit',?,?,?)
       on conflict(entity_type,entity_id) do update set
       client_modified_at=excluded.client_modified_at,
       mutation_id=excluded.mutation_id`,
      [habitId, version.clientModifiedAt, version.mutationId]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'habit',
      entityId: habitId,
      operation: 'delete',
      payload: {},
    });
  });
}

export async function toggleHabit(
  habitId: string,
  localDate: string,
  status: HabitLog['status'] = 'done'
) {
  const existing = await first<HabitLog>(
    'select * from habit_logs where habit_id=? and local_date=?',
    [habitId, localDate]
  );
  const id = existing?.id ?? uuid();
  const version = mutationVersion();
  const remove = existing?.deleted_at == null && existing?.status === status;
  await currentDatabase().transaction(async (tx) => {
    if (remove) {
      await tx.execute(
        `update habit_logs set deleted_at=?,client_modified_at=?,
         last_mutation_id=?,sync_error=null where id=?`,
        [
          version.clientModifiedAt,
          version.clientModifiedAt,
          version.mutationId,
          id,
        ]
      );
      await tx.execute(
        `insert into tombstones(entity_type,entity_id,client_modified_at,mutation_id)
         values('habit_log',?,?,?)
         on conflict(entity_type,entity_id) do update set
         client_modified_at=excluded.client_modified_at,
         mutation_id=excluded.mutation_id`,
        [id, version.clientModifiedAt, version.mutationId]
      );
    } else {
      await tx.execute(
        `insert into habit_logs (
          id,habit_id,local_date,status,client_modified_at,last_mutation_id
        ) values (?,?,?,?,?,?)
        on conflict(habit_id,local_date) do update set status=excluded.status,
        deleted_at=null,client_modified_at=excluded.client_modified_at,
        last_mutation_id=excluded.last_mutation_id,sync_error=null`,
        [
          id,
          habitId,
          localDate,
          status,
          version.clientModifiedAt,
          version.mutationId,
        ]
      );
      await tx.execute(
        "delete from tombstones where entity_type='habit_log' and entity_id=?",
        [id]
      );
    }
    await queueMutation(tx, {
      ...version,
      entityType: 'habit_log',
      entityId: id,
      operation: remove ? 'delete' : 'upsert',
      payload: remove
        ? {}
        : {
            habitId,
            localDate,
            status,
            value: null,
            note: null,
            prayerStatus: null,
          },
    });
  });
}

export async function saveJournal(
  localDate: string,
  winNote: string,
  reflectionNote: string
) {
  const existing = await first<{ id: string }>(
    'select id from journals where local_date=?',
    [localDate]
  );
  const id = existing?.id ?? uuid();
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into journals (
        id,local_date,win_note,reflection_note,client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?)
      on conflict(local_date) do update set win_note=excluded.win_note,
      reflection_note=excluded.reflection_note,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
      [
        id,
        localDate,
        winNote || null,
        reflectionNote || null,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'journal',
      entityId: id,
      operation: 'upsert',
      payload: {
        localDate,
        winNote: winNote || null,
        reflectionNote: reflectionNote || null,
      },
    });
  });
}

export async function savePrayerLog(
  prayer: string,
  localDate: string,
  status: 'on_time' | 'late' | 'missed'
) {
  const existing = await first<{ id: string }>(
    'select id from prayer_logs where prayer_name=? and local_date=?',
    [prayer, localDate]
  );
  const id = existing?.id ?? uuid();
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into prayer_logs (
        id,local_date,prayer_name,status,client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?)
      on conflict(local_date,prayer_name) do update set status=excluded.status,
      deleted_at=null,client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
      [
        id,
        localDate,
        prayer,
        status,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'prayer_log',
      entityId: id,
      operation: 'upsert',
      payload: { prayer, localDate, status },
    });
  });
}

export async function saveProfile(payload: {
  id: string;
  email: string;
  name: string;
  timezone: string;
  units: 'metric' | 'imperial';
}) {
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into profile (
        id,email,name,timezone,units,client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?,?)
      on conflict(id) do update set name=excluded.name,
      timezone=excluded.timezone,units=excluded.units,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
      [
        payload.id,
        payload.email,
        payload.name,
        payload.timezone,
        payload.units,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'profile',
      entityId: payload.id,
      operation: 'upsert',
      payload: {
        name: payload.name,
        timezone: payload.timezone,
        units: payload.units,
      },
    });
  });
}

export async function savePushInstallation(
  installationId: string,
  platform: 'ios' | 'android',
  pushToken: string,
  permissionState: string
) {
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into push_installations (
        installation_id,platform,push_token,permission_state,
        client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?)
      on conflict(installation_id) do update set
      platform=excluded.platform,push_token=excluded.push_token,
      permission_state=excluded.permission_state,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
      [
        installationId,
        platform,
        pushToken,
        permissionState,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'push_installation',
      entityId: installationId,
      operation: 'upsert',
      payload: {
        installationId,
        platform,
        pushToken,
      },
    });
  });
}

export async function setPushInstallationEnabled(
  installationId: string,
  enabled: boolean
) {
  const installation = await first<{
    platform: 'ios' | 'android';
    push_token: string | null;
  }>(
    `select platform,push_token from push_installations
     where installation_id=?`,
    [installationId]
  );
  if (!installation) return;

  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `update push_installations set permission_state=?,
       client_modified_at=?,last_mutation_id=?,sync_error=null
       where installation_id=?`,
      [
        enabled ? 'enabled' : 'disabled',
        version.clientModifiedAt,
        version.mutationId,
        installationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'push_installation',
      entityId: installationId,
      operation: enabled ? 'upsert' : 'delete',
      payload: enabled
        ? {
            installationId,
            platform: installation.platform,
            pushToken: installation.push_token,
          }
        : {},
    });
  });
}

export async function isPushEnabled() {
  const preference = await first<{ push_enabled: number }>(
    'select push_enabled from preferences limit 1'
  );
  return preference ? Boolean(preference.push_enabled) : true;
}

export type PreferencesDraft = {
  goals: string[];
  pace: 'light' | 'balanced' | 'ambitious';
  religion: 'muslim' | 'other' | 'unspecified';
  dailyDigestTime: string;
  dailyDigestEnabled: boolean;
  pushEnabled?: boolean;
  prayerSetup: {
    latitude: number;
    longitude: number;
    timezone: string;
    madhab: 'hanafi' | 'shafi' | 'maliki' | 'hanbali';
    calculationMethod: string;
    reminders: {
      prayer: string;
      enabled: boolean;
      offsetMinutes: number;
    }[];
  } | null;
};

export async function savePreferences(userId: string, value: PreferencesDraft) {
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await writePreferences(tx, userId, value, version);
    await queueMutation(tx, {
      ...version,
      entityType: 'preferences',
      entityId: userId,
      operation: 'upsert',
      payload: value,
    });
  });
}

export async function completeOnboarding(
  user: { id: string; email: string },
  value: PreferencesDraft & {
    name: string;
    units: 'metric' | 'imperial';
    templateIds: string[];
  }
) {
  const version = mutationVersion();
  const templates = await rows<{
    id: string;
    name: string;
    icon: string;
    category: string;
    habit_type: Habit['habit_type'];
    default_target: number | null;
    default_unit: string | null;
    default_frequency: string;
  }>(
    `select id,name,icon,category,habit_type,default_target,
     default_unit,default_frequency from habit_templates
     where id in (${value.templateIds.map(() => '?').join(',')})`,
    value.templateIds
  );
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into profile (
        id,email,name,timezone,units,onboarding_completed_at,
        client_modified_at,last_mutation_id
      ) values (?,?,?,?,?,?,?,?)
      on conflict(id) do update set name=excluded.name,units=excluded.units,
      onboarding_completed_at=excluded.onboarding_completed_at,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id`,
      [
        user.id,
        user.email,
        value.name,
        value.prayerSetup?.timezone ?? 'UTC',
        value.units,
        version.clientModifiedAt,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await writePreferences(tx, user.id, value, version);
    for (const template of templates) {
      await tx.execute(
        `insert or ignore into habits (
          id,template_id,name,icon,category,habit_type,target,unit,frequency,
          forgiving,state,client_modified_at,last_mutation_id
        ) values (?,?,?,?,?,?,?,?,?,0,'active',?,?)`,
        [
          uuid(),
          template.id,
          template.name,
          template.icon,
          template.category,
          template.habit_type,
          template.default_target,
          template.default_unit,
          template.default_frequency,
          version.clientModifiedAt,
          version.mutationId,
        ]
      );
    }
    await tx.execute(
      'update onboarding_state set completed=1,updated_at=? where id=1',
      [version.clientModifiedAt]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'onboarding',
      entityId: user.id,
      operation: 'upsert',
      payload: value,
    });
  });
}

export async function saveHabitReminder(
  habitId: string,
  enabled: boolean,
  time: string | null
) {
  const version = mutationVersion();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into habit_reminders (
        habit_id,enabled,time_local,client_modified_at,last_mutation_id
      ) values (?,?,?,?,?)
      on conflict(habit_id) do update set enabled=excluded.enabled,
      time_local=excluded.time_local,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
      [
        habitId,
        enabled ? 1 : 0,
        enabled ? time : null,
        version.clientModifiedAt,
        version.mutationId,
      ]
    );
    await queueMutation(tx, {
      ...version,
      entityType: 'habit_reminder',
      entityId: habitId,
      operation: enabled ? 'upsert' : 'delete',
      payload: { habitId, enabled, time: enabled ? time : null },
    });
  });
}

export async function pendingMutations(limit = 100) {
  const result = await rows<{
    mutation_id: string;
    entity_type: MutationEntity;
    entity_id: string;
    operation: 'upsert' | 'delete';
    client_modified_at: string;
    payload: string;
  }>(
    `select mutation_id,entity_type,entity_id,operation,
     client_modified_at,payload from mutation_outbox
     where state in ('pending','retry')
       and (next_attempt_at is null or next_attempt_at <= ?)
     order by created_at limit ?`,
    [new Date().toISOString(), limit]
  );
  return result.map((row) => ({
    mutationId: row.mutation_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    clientModifiedAt: row.client_modified_at,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}

export async function outboxCount() {
  const value = await first<{ count: number }>(
    `select
       (select count(*) from mutation_outbox where state <> 'rejected') +
       (select count(*) from pending_asset_uploads where state <> 'rejected')
       as count`
  );
  return value?.count ?? 0;
}

export async function needsAttentionCount() {
  const value = await first<{ count: number }>(
    `select
       (select count(*) from mutation_outbox where state = 'rejected') +
       (select count(*) from pending_asset_uploads where state = 'rejected')
       as count`
  );
  return value?.count ?? 0;
}

async function queueMutation(tx: Transaction, mutation: SyncMutation) {
  await tx.execute(
    `insert into mutation_outbox (
      mutation_id,entity_type,entity_id,operation,client_modified_at,
      payload,coalesce_key,created_at
    ) values (?,?,?,?,?,?,?,?)
    on conflict(coalesce_key) do update set
      mutation_id=excluded.mutation_id,operation=excluded.operation,
      client_modified_at=excluded.client_modified_at,payload=excluded.payload,
      state='pending',attempt_count=0,next_attempt_at=null,
      error_code=null,error_message=null`,
    [
      mutation.mutationId,
      mutation.entityType,
      mutation.entityId,
      mutation.operation,
      mutation.clientModifiedAt,
      JSON.stringify(mutation.payload),
      `${mutation.entityType}:${mutation.entityId}`,
      mutation.clientModifiedAt,
    ]
  );
}

function mutationVersion() {
  return {
    mutationId: uuid(),
    clientModifiedAt: new Date().toISOString(),
  };
}

async function writePreferences(
  tx: Transaction,
  userId: string,
  value: PreferencesDraft,
  version: ReturnType<typeof mutationVersion>
) {
  const setup = value.religion === 'muslim' ? value.prayerSetup : null;
  await tx.execute(
    `insert into preferences (
      user_id,goals,pace,daily_digest_time,daily_digest_enabled,push_enabled,religion,
      latitude,longitude,madhab,calculation_method,
      client_modified_at,last_mutation_id
    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(user_id) do update set goals=excluded.goals,pace=excluded.pace,
      daily_digest_time=excluded.daily_digest_time,
      daily_digest_enabled=excluded.daily_digest_enabled,
      push_enabled=excluded.push_enabled,
      religion=excluded.religion,latitude=excluded.latitude,
      longitude=excluded.longitude,madhab=excluded.madhab,
      calculation_method=excluded.calculation_method,
      client_modified_at=excluded.client_modified_at,
      last_mutation_id=excluded.last_mutation_id,sync_error=null`,
    [
      userId,
      JSON.stringify(value.goals),
      value.pace,
      value.dailyDigestTime,
      value.dailyDigestEnabled ? 1 : 0,
      value.pushEnabled === false ? 0 : 1,
      value.religion,
      setup?.latitude ?? null,
      setup?.longitude ?? null,
      setup?.madhab ?? null,
      setup?.calculationMethod ?? null,
      version.clientModifiedAt,
      version.mutationId,
    ]
  );
  if (setup) {
    for (const reminder of setup.reminders) {
      await tx.execute(
        `insert into prayer_reminders (
          prayer_name,enabled,offset_minutes,client_modified_at,last_mutation_id
        ) values (?,?,?,?,?)
        on conflict(prayer_name) do update set enabled=excluded.enabled,
        offset_minutes=excluded.offset_minutes,
        client_modified_at=excluded.client_modified_at,
        last_mutation_id=excluded.last_mutation_id,sync_error=null`,
        [
          reminder.prayer,
          reminder.enabled ? 1 : 0,
          reminder.offsetMinutes,
          version.clientModifiedAt,
          version.mutationId,
        ]
      );
    }
  }
}
