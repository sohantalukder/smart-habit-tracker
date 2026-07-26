create extension if not exists "pgcrypto";

create type admin_role as enum ('support', 'moderator', 'super_admin');
create type habit_type as enum ('do', 'avoid', 'count', 'duration');
create type habit_state as enum ('active', 'paused', 'archived');
create type log_status as enum ('done', 'skipped', 'partial');
create type delivery_state as enum ('scheduled', 'processing', 'sent', 'failed', 'cancelled');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_normalized check (email = lower(trim(email)))
);

create unique index users_email_unique_idx on users (lower(email));

create table profiles (
  id uuid primary key references users(id) on delete cascade,
  name text not null default '',
  timezone text not null default 'UTC',
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  faith_preference text not null default 'none' check (faith_preference in ('none', 'muslim')),
  prayer_enabled boolean not null default false,
  onboarding_completed_at timestamptz,
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table admin_memberships (
  user_id uuid primary key references profiles(id) on delete cascade,
  role admin_role not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table habit_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  category text not null,
  habit_type habit_type not null,
  icon text not null,
  default_target numeric,
  default_unit text,
  default_frequency jsonb not null default '{"kind":"daily"}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  template_id uuid references habit_templates(id) on delete set null,
  name text not null,
  icon text not null,
  category text not null,
  habit_type habit_type not null,
  target numeric,
  unit text,
  frequency jsonb not null,
  forgiving boolean not null default false,
  state habit_state not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table habit_daily_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  status log_status not null,
  value numeric,
  note text,
  prayer_status text check (prayer_status is null or prayer_status in ('on_time','late','missed')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(habit_id, local_date),
  unique(user_id, idempotency_key)
);

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  habit_id uuid references habits(id) on delete set null,
  channel text not null check (channel in ('push','email','in_app')),
  title text not null,
  body text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  state delivery_state not null default 'scheduled',
  attempt_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create table idempotency_records (
  user_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  route text not null,
  response_status integer not null,
  response_body jsonb not null,
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key(user_id, key, route)
);

create index user_sessions_active_idx
  on user_sessions(token_hash, expires_at)
  where revoked_at is null;
create index email_verification_active_idx
  on email_verification_tokens(user_id, expires_at)
  where consumed_at is null;
create index habits_user_state_idx
  on habits(user_id, state)
  where deleted_at is null;
create index logs_user_date_idx on habit_daily_logs(user_id, local_date desc);
create index delivery_state_idx on notification_deliveries(state, scheduled_at);
