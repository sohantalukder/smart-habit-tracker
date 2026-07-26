# Support access

The support portal accepts only a verified first-party Bloom user whose
`admin_memberships.role` is exactly `support`. Suspended and deleted profiles
are denied by both the session guard and the support check.

Create and verify the account through the normal signup flow, then grant access:

```sql
insert into admin_memberships (user_id, role)
select id, 'support'::admin_role
from users
where email = lower('support@example.com')
on conflict (user_id) do update set role = excluded.role;
```

Do not grant `moderator` or `super_admin` as a substitute. The current portal
intentionally accepts only the exact `support` role.
