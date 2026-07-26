alter table firebase_installations
  add column if not exists push_token text;

alter table firebase_installations
  drop constraint if exists firebase_installations_platform_check,
  add constraint firebase_installations_platform_check
    check (platform in ('web', 'ios', 'android')),
  drop constraint if exists firebase_installations_native_token_check,
  add constraint firebase_installations_native_token_check
    check (
      (platform = 'web' and push_token is null)
      or (platform in ('ios', 'android') and push_token is not null)
    );

create unique index if not exists firebase_installations_push_token_unique_idx
  on firebase_installations(push_token)
  where push_token is not null;

create table if not exists sync_change_log (
  sequence bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  payload jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists sync_change_log_user_sequence_idx
  on sync_change_log(user_id, sequence);

create table if not exists sync_processed_mutations (
  user_id uuid not null references profiles(id) on delete cascade,
  mutation_id uuid not null,
  device_id text not null,
  status text not null check (status in ('applied', 'superseded', 'rejected')),
  response jsonb not null default '{}',
  processed_at timestamptz not null default now(),
  primary key(user_id, mutation_id)
);

create index if not exists sync_processed_mutations_processed_idx
  on sync_processed_mutations(processed_at);

create table if not exists sync_tombstones (
  user_id uuid not null references profiles(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  client_modified_at timestamptz not null,
  last_mutation_id text not null,
  deleted_at timestamptz not null default now(),
  primary key(user_id, entity_type, entity_id)
);

alter table profiles
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text;
alter table habits
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text;
alter table habit_daily_logs
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text,
  add column if not exists deleted_at timestamptz;
alter table daily_journals
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text;
alter table prayer_logs
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text,
  add column if not exists deleted_at timestamptz;
alter table habit_reminders
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text;
alter table prayer_reminder_settings
  add column if not exists client_modified_at timestamptz,
  add column if not exists last_mutation_id text;

update profiles set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update habits set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update habit_daily_logs set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update daily_journals set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update prayer_logs set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update habit_reminders set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;
update prayer_reminder_settings set client_modified_at = updated_at,
  last_mutation_id = coalesce(last_mutation_id, gen_random_uuid()::text)
where client_modified_at is null or last_mutation_id is null;

alter table profiles alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table habits alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table habit_daily_logs alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table daily_journals alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table prayer_logs alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table habit_reminders alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;
alter table prayer_reminder_settings alter column client_modified_at set default now(),
  alter column client_modified_at set not null,
  alter column last_mutation_id set default gen_random_uuid()::text,
  alter column last_mutation_id set not null;

create or replace function stamp_sync_change()
returns trigger language plpgsql as $$
begin
  if new.client_modified_at is not distinct from old.client_modified_at
     and new.last_mutation_id is not distinct from old.last_mutation_id then
    new.client_modified_at := now();
    new.last_mutation_id := gen_random_uuid()::text;
  end if;
  return new;
end;
$$;

create or replace function record_sync_change()
returns trigger language plpgsql as $$
declare
  row_data jsonb;
  owner_id uuid;
  record_id text;
  deleted boolean;
  tombstone_time timestamptz;
  tombstone_mutation_id text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;
  owner_id := case
    when tg_table_name = 'profiles' then (row_data->>'id')::uuid
    else (row_data->>'user_id')::uuid
  end;
  record_id := case
    when tg_table_name = 'habit_reminders' then row_data->>'habit_id'
    when tg_table_name = 'prayer_reminder_settings' then row_data->>'prayer_name'
    else row_data->>'id'
  end;
  deleted := tg_op = 'DELETE'
    or coalesce((row_data->>'deleted_at') is not null, false);

  if tg_table_name = 'profiles' and tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'DELETE' then
    tombstone_time := now();
    tombstone_mutation_id := gen_random_uuid()::text;
    insert into sync_tombstones (
      user_id, entity_type, entity_id, client_modified_at, last_mutation_id
    )
    values (
      owner_id, tg_argv[0], record_id, tombstone_time, tombstone_mutation_id
    )
    on conflict (user_id, entity_type, entity_id) do update
    set client_modified_at = excluded.client_modified_at,
        last_mutation_id = excluded.last_mutation_id,
        deleted_at = now();
  end if;

  insert into sync_change_log (
    user_id, entity_type, entity_id, operation, payload
  )
  values (
    owner_id,
    tg_argv[0],
    record_id,
    case when deleted then 'delete' else 'upsert' end,
    case when deleted then null else row_data end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'habits', 'habit_daily_logs', 'daily_journals',
    'prayer_logs', 'habit_reminders', 'prayer_reminder_settings'
  ]
  loop
    execute format('drop trigger if exists %I on %I', 'sync_stamp_before_update', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function stamp_sync_change()',
      'sync_stamp_before_update',
      table_name
    );
  end loop;
end $$;

drop trigger if exists sync_profiles_change on profiles;
create trigger sync_profiles_change after insert or update or delete on profiles
  for each row execute function record_sync_change('profile');
drop trigger if exists sync_habits_change on habits;
create trigger sync_habits_change after insert or update or delete on habits
  for each row execute function record_sync_change('habit');
drop trigger if exists sync_habit_logs_change on habit_daily_logs;
create trigger sync_habit_logs_change after insert or update or delete on habit_daily_logs
  for each row execute function record_sync_change('habit_log');
drop trigger if exists sync_journals_change on daily_journals;
create trigger sync_journals_change after insert or update or delete on daily_journals
  for each row execute function record_sync_change('journal');
drop trigger if exists sync_prayer_logs_change on prayer_logs;
create trigger sync_prayer_logs_change after insert or update or delete on prayer_logs
  for each row execute function record_sync_change('prayer_log');
drop trigger if exists sync_habit_reminders_change on habit_reminders;
create trigger sync_habit_reminders_change after insert or update or delete on habit_reminders
  for each row execute function record_sync_change('habit_reminder');
drop trigger if exists sync_prayer_reminders_change on prayer_reminder_settings;
create trigger sync_prayer_reminders_change after insert or update or delete on prayer_reminder_settings
  for each row execute function record_sync_change('prayer_reminder');

create or replace function record_notification_sync_change()
returns trigger language plpgsql as $$
begin
  insert into sync_change_log (
    user_id, entity_type, entity_id, operation, payload
  )
  values (
    case when tg_op = 'DELETE' then old.user_id else new.user_id end,
    'notification',
    case when tg_op = 'DELETE' then old.id::text else new.id::text end,
    case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_notifications_change on notification_deliveries;
create trigger sync_notifications_change
  after insert or update or delete on notification_deliveries
  for each row execute function record_notification_sync_change();
