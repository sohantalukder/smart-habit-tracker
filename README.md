# Smart Habit Server

The standalone backend for Bloom. It contains a NestJS REST API, a BullMQ
worker, first-party email/password authentication, and direct PostgreSQL data
access. Web and native clients use opaque bearer session tokens issued by this
API.

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis.
3. Run `pnpm install` and `pnpm db:migrate`.
4. Run `pnpm dev:api` and `pnpm dev:worker` in separate terminals.

The API is served under `/v1`. Its versioned contract is available at
`/v1/openapi.json`. In non-production environments without a Resend key,
verification links are written as structured API logs.

## Authentication

Passwords are salted and hashed with `scrypt`. Email-verification and session
secrets are random values; only their SHA-256 hashes are stored. Verification
links expire after 24 hours and sessions after 30 days. Redis rate limits
signup, login, verification, and resend attempts.

The admin portal accepts `support` and `super_admin` memberships. To grant an
already verified user support access:

```sql
insert into admin_memberships (user_id, role)
select id, 'support'::admin_role
from users
where email = lower('support@example.com')
on conflict (user_id) do update set role = excluded.role;
```

## Render

Create a Render Blueprint from `render.yaml`. It provisions:

- `smart-habit-db`, managed PostgreSQL.
- `smart-habit-api`, a Docker web service.
- `smart-habit-worker`, a separate Docker background worker.
- `smart-habit-jobs`, a persistent same-region Key Value service.

The API runs `pnpm db:migrate` as its pre-deploy command. Set `SITE_URL`,
`RESEND_API_KEY`, `EMAIL_FROM`, `ALLOWED_ORIGINS`, and observability secrets in
Render. Deploy the API migration before the worker when schema changes are
introduced.

Native clients call the same auth endpoints and keep the returned bearer token
in platform-secure storage. The web client keeps it in a first-party HttpOnly
cookie through its Next.js proxy.
