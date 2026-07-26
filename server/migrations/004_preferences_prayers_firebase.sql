alter table profiles
  add column if not exists goal_preferences text[] not null default '{}',
  add column if not exists starting_pace text not null default 'balanced',
  add column if not exists religion_preference text not null default 'unspecified',
  add column if not exists daily_digest_time time not null default '20:00',
  add column if not exists daily_digest_enabled boolean not null default true,
  add column if not exists latitude numeric(8,5),
  add column if not exists longitude numeric(9,5),
  add column if not exists location_updated_at timestamptz,
  add column if not exists madhab text,
  add column if not exists prayer_calculation_method text;

update profiles
set religion_preference = case
  when faith_preference = 'muslim' then 'muslim'
  else 'unspecified'
end
where religion_preference = 'unspecified';

alter table profiles
  drop constraint if exists profiles_starting_pace_check,
  add constraint profiles_starting_pace_check
    check (starting_pace in ('light', 'balanced', 'ambitious')),
  drop constraint if exists profiles_religion_preference_check,
  add constraint profiles_religion_preference_check
    check (religion_preference in ('muslim', 'other', 'unspecified')),
  drop constraint if exists profiles_goal_preferences_check,
  add constraint profiles_goal_preferences_check
    check (
      goal_preferences <@ array[
        'movement', 'nutrition', 'learning', 'sleep', 'mindfulness'
      ]::text[]
    ),
  drop constraint if exists profiles_coordinates_check,
  add constraint profiles_coordinates_check
    check (
      (latitude is null and longitude is null)
      or
      (latitude between -90 and 90 and longitude between -180 and 180)
    ),
  drop constraint if exists profiles_madhab_check,
  add constraint profiles_madhab_check
    check (
      madhab is null
      or madhab in ('hanafi', 'shafi', 'maliki', 'hanbali')
    ),
  drop constraint if exists profiles_prayer_calculation_method_check,
  add constraint profiles_prayer_calculation_method_check
    check (
      prayer_calculation_method is null
      or prayer_calculation_method in (
        'karachi',
        'muslim_world_league',
        'egyptian',
        'umm_al_qura',
        'dubai',
        'qatar',
        'kuwait',
        'moonsighting_committee',
        'singapore',
        'turkey',
        'tehran',
        'north_america'
      )
    );

alter table habit_templates
  add column if not exists goal_tags text[] not null default '{}',
  add column if not exists recommendation_priority integer not null default 100;

update habit_templates
set goal_tags = case slug
  when 'no-added-sugar' then array['nutrition']
  when 'daily-steps' then array['movement']
  when 'read-learn' then array['learning']
  when 'gym-visits' then array['movement']
  when 'food-diary' then array['nutrition', 'mindfulness']
  else goal_tags
end,
recommendation_priority = case slug
  when 'daily-steps' then 10
  when 'no-added-sugar' then 20
  when 'read-learn' then 10
  when 'gym-visits' then 30
  when 'food-diary' then 30
  else recommendation_priority
end;

insert into habit_templates (
  slug, name, description, category, habit_type, icon,
  default_target, default_unit, default_frequency,
  goal_tags, recommendation_priority
)
values
  (
    'morning-stretch', 'Morning stretch',
    'Begin the day with gentle movement.', 'gym', 'duration', '🧘',
    10, 'minutes', '{"kind":"daily"}', array['movement'], 20
  ),
  (
    'drink-water', 'Drink water',
    'Keep hydration visible throughout the day.', 'food', 'count', '💧',
    8, 'glasses', '{"kind":"daily"}', array['nutrition'], 10
  ),
  (
    'learn-something', 'Learn something',
    'Give one focused block to a useful skill.', 'learning', 'duration', '🧠',
    15, 'minutes', '{"kind":"daily"}', array['learning'], 20
  ),
  (
    'consistent-bedtime', 'Consistent bedtime',
    'Close the day at a time your body can trust.', 'other', 'do', '🌙',
    null, null, '{"kind":"daily"}', array['sleep'], 10
  ),
  (
    'screen-free-wind-down', 'Screen-free wind-down',
    'Make space for a quieter transition to sleep.', 'other', 'duration', '📵',
    30, 'minutes', '{"kind":"daily"}', array['sleep'], 20
  ),
  (
    'mindful-breathing', 'Mindful breathing',
    'Pause and return attention to the present.', 'other', 'duration', '🌿',
    5, 'minutes', '{"kind":"daily"}', array['mindfulness'], 10
  ),
  (
    'daily-reflection', 'Daily reflection',
    'Notice what helped and what needs care.', 'other', 'do', '✍️',
    null, null, '{"kind":"daily"}', array['mindfulness'], 20
  )
on conflict (slug) do update
set goal_tags = excluded.goal_tags,
    recommendation_priority = excluded.recommendation_priority,
    updated_at = now();

create table if not exists prayer_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  prayer_name text not null
    check (prayer_name in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  status text not null
    check (status in ('on_time', 'late', 'missed')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, local_date, prayer_name),
  unique(user_id, idempotency_key)
);

create index if not exists prayer_logs_user_date_idx
  on prayer_logs(user_id, local_date desc);

create table if not exists prayer_reminder_settings (
  user_id uuid not null references profiles(id) on delete cascade,
  prayer_name text not null
    check (prayer_name in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  enabled boolean not null default true,
  offset_minutes integer not null default 0
    check (offset_minutes between 0 and 120),
  updated_at timestamptz not null default now(),
  primary key(user_id, prayer_name)
);

create table if not exists habit_reminders (
  habit_id uuid primary key references habits(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  enabled boolean not null default true,
  time_local time not null,
  updated_at timestamptz not null default now()
);

create index if not exists habit_reminders_user_idx
  on habit_reminders(user_id)
  where enabled = true;

create table if not exists firebase_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  installation_id text not null,
  platform text not null default 'web' check (platform in ('web')),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(installation_id)
);

create index if not exists firebase_installations_user_active_idx
  on firebase_installations(user_id, last_seen_at desc)
  where active = true;

alter table notification_deliveries
  add column if not exists source_type text,
  add column if not exists source_key text,
  add column if not exists metadata jsonb not null default '{}';

create unique index if not exists notification_deliveries_source_unique_idx
  on notification_deliveries(user_id, channel, source_key)
  where source_key is not null;

create table if not exists notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references notification_deliveries(id) on delete cascade,
  installation_id uuid not null references firebase_installations(id) on delete cascade,
  state delivery_state not null default 'scheduled',
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(delivery_id, installation_id)
);

create index if not exists notification_delivery_attempts_delivery_idx
  on notification_delivery_attempts(delivery_id, state);
