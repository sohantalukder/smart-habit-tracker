with ranked_template_habits as (
  select id,
         row_number() over (
           partition by user_id, template_id
           order by created_at, id
         ) as duplicate_number
  from habits
  where template_id is not null
    and deleted_at is null
)
update habits
set template_id = null,
    updated_at = now()
where id in (
  select id
  from ranked_template_habits
  where duplicate_number > 1
);

create unique index habits_user_template_unique_idx
  on habits(user_id, template_id)
  where template_id is not null and deleted_at is null;

do $bootstrap_super_admin$
declare
  bootstrap_user_id uuid;
begin
  select id
  into bootstrap_user_id
  from users
  where email = 'sohan@admin.com';

  if bootstrap_user_id is null then
    insert into users (email, password_hash, email_verified_at)
    values (
      'sohan@admin.com',
      'scrypt$32768$8$1$BuHAf6m4qfGzsQUUpsJe8Q$afKrLRfOpJGeDilf0vk-KLdiD1ckuVDhotP5D4Sijfp1gRewi20B_WmYdERvH3BFGTsvXQu6wOF6oJ9kKWhRyQ',
      now()
    )
    returning id into bootstrap_user_id;
  else
    update users
    set password_hash = 'scrypt$32768$8$1$BuHAf6m4qfGzsQUUpsJe8Q$afKrLRfOpJGeDilf0vk-KLdiD1ckuVDhotP5D4Sijfp1gRewi20B_WmYdERvH3BFGTsvXQu6wOF6oJ9kKWhRyQ',
        email_verified_at = coalesce(email_verified_at, now()),
        updated_at = now()
    where id = bootstrap_user_id;
  end if;

  insert into profiles (id, name, suspended_at, deleted_at)
  values (bootstrap_user_id, 'Sohan', null, null)
  on conflict (id) do update
  set name = 'Sohan',
      suspended_at = null,
      deleted_at = null,
      updated_at = now();

  update user_sessions
  set revoked_at = coalesce(revoked_at, now())
  where user_id = bootstrap_user_id;

  insert into admin_memberships (user_id, role)
  values (bootstrap_user_id, 'super_admin')
  on conflict (user_id) do update
  set role = excluded.role;
end
$bootstrap_super_admin$;
