import type { SQLBatchTuple } from '@op-engineering/op-sqlite';

export const DATABASE_VERSION = 1;

export const schema: SQLBatchTuple[] = [
  ['pragma journal_mode = WAL'],
  ['pragma foreign_keys = ON'],
  [
    `create table if not exists sync_metadata (
    key text primary key,
    value text not null
  )`,
  ],
  [
    `create table if not exists profile (
    id text primary key,
    email text not null,
    name text not null,
    timezone text not null default 'UTC',
    units text not null default 'metric',
    avatar_uri text,
    onboarding_completed_at text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists preferences (
    user_id text primary key,
    goals text not null default '[]',
    pace text not null default 'balanced',
    daily_digest_time text not null default '20:00',
    daily_digest_enabled integer not null default 1,
    push_enabled integer not null default 0,
    religion text not null default 'unspecified',
    latitude real,
    longitude real,
    madhab text,
    calculation_method text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists habit_templates (
    id text primary key,
    slug text not null,
    name text not null,
    description text not null,
    category text not null,
    habit_type text not null,
    icon text not null,
    default_target real,
    default_unit text,
    default_frequency text not null,
    goal_tags text not null default '[]',
    recommendation_priority integer not null default 100,
    updated_at text not null
  )`,
  ],
  [
    `create table if not exists habits (
    id text primary key,
    template_id text,
    name text not null,
    icon text not null,
    category text not null,
    habit_type text not null,
    target real,
    unit text,
    frequency text not null,
    forgiving integer not null default 0,
    state text not null default 'active',
    deleted_at text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists habit_logs (
    id text primary key,
    habit_id text not null references habits(id),
    local_date text not null,
    status text not null,
    value real,
    note text,
    prayer_status text,
    deleted_at text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text,
    unique(habit_id, local_date)
  )`,
  ],
  [
    `create table if not exists journals (
    id text primary key,
    local_date text not null unique,
    win_note text,
    reflection_note text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists prayer_logs (
    id text primary key,
    local_date text not null,
    prayer_name text not null,
    status text not null,
    deleted_at text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text,
    unique(local_date, prayer_name)
  )`,
  ],
  [
    `create table if not exists habit_reminders (
    habit_id text primary key references habits(id),
    enabled integer not null,
    time_local text,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists prayer_reminders (
    prayer_name text primary key,
    enabled integer not null,
    offset_minutes integer not null default 0,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists notifications (
    id text primary key,
    title text not null,
    body text not null,
    metadata text not null default '{}',
    state text not null,
    scheduled_at text not null,
    sent_at text,
    read_at text,
    updated_at text not null
  )`,
  ],
  [
    `create table if not exists onboarding_state (
    id integer primary key check(id = 1),
    step integer not null default 0,
    draft text not null default '{}',
    completed integer not null default 0,
    updated_at text not null
  )`,
  ],
  [
    `create table if not exists tombstones (
    entity_type text not null,
    entity_id text not null,
    client_modified_at text not null,
    mutation_id text not null,
    primary key(entity_type, entity_id)
  )`,
  ],
  [
    `create table if not exists pending_asset_uploads (
    id text primary key,
    entity_type text not null,
    entity_id text not null,
    private_path text not null,
    mime_type text not null,
    state text not null default 'pending',
    attempt_count integer not null default 0,
    last_error text,
    created_at text not null
  )`,
  ],
  [
    `create table if not exists push_installations (
    installation_id text primary key,
    platform text not null,
    push_token text,
    permission_state text not null,
    client_modified_at text not null,
    last_mutation_id text not null,
    sync_error text
  )`,
  ],
  [
    `create table if not exists mutation_outbox (
    mutation_id text primary key,
    entity_type text not null,
    entity_id text not null,
    operation text not null,
    client_modified_at text not null,
    payload text not null,
    coalesce_key text not null unique,
    state text not null default 'pending',
    attempt_count integer not null default 0,
    next_attempt_at text,
    error_code text,
    error_message text,
    created_at text not null
  )`,
  ],
  [
    `create index if not exists mutation_outbox_ready_idx
    on mutation_outbox(state, next_attempt_at, created_at)`,
  ],
  [
    `insert or ignore into onboarding_state(id, updated_at)
    values (1, datetime('now'))`,
  ],
  [`pragma user_version = ${DATABASE_VERSION}`],
];
