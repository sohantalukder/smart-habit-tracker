alter table profiles
  add column if not exists avatar_object_path text,
  add column if not exists avatar_updated_at timestamptz,
  add column if not exists deletion_purge_at timestamptz;

alter table profiles
  drop constraint if exists profiles_avatar_path_check,
  add constraint profiles_avatar_path_check
    check (
      avatar_object_path is null
      or avatar_object_path ~ '^profile-avatars/[0-9a-f-]+/avatar\.webp$'
    ),
  drop constraint if exists profiles_deletion_purge_check,
  add constraint profiles_deletion_purge_check
    check (
      deletion_purge_at is null
      or deleted_at is not null
    );

create index if not exists profiles_deletion_purge_idx
  on profiles(deletion_purge_at)
  where deletion_purge_at is not null;

create table if not exists email_change_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pending_email text not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_change_pending_email_normalized
    check (pending_email = lower(trim(pending_email)))
);

create index if not exists email_change_tokens_active_idx
  on email_change_tokens(user_id, expires_at)
  where consumed_at is null;
