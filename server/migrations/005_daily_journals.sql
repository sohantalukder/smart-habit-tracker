create table daily_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  win_note text,
  reflection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, local_date),
  constraint daily_journals_win_note_length check (
    win_note is null or char_length(win_note) <= 1000
  ),
  constraint daily_journals_reflection_note_length check (
    reflection_note is null or char_length(reflection_note) <= 1000
  )
);

create index daily_journals_user_date_idx
  on daily_journals(user_id, local_date desc);
