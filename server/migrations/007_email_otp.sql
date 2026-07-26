alter table email_verification_tokens
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists locked_at timestamptz;

alter table email_change_tokens
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists locked_at timestamptz;

alter table email_verification_tokens
  drop constraint if exists email_verification_attempt_count_check,
  add constraint email_verification_attempt_count_check
    check (attempt_count between 0 and 5);

alter table email_change_tokens
  drop constraint if exists email_change_attempt_count_check,
  add constraint email_change_attempt_count_check
    check (attempt_count between 0 and 5);

-- Link tokens issued by older releases cannot be interpreted as six-digit OTPs.
update email_verification_tokens
set consumed_at = coalesce(consumed_at, now())
where consumed_at is null;

update email_change_tokens
set consumed_at = coalesce(consumed_at, now())
where consumed_at is null;
