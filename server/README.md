# Smart Habit Server

The standalone backend for Bloom. It contains a NestJS REST API, a BullMQ
worker, first-party email/password authentication, and direct PostgreSQL data
access. Web and native clients use opaque bearer session tokens issued by this
API.

The worker materializes seven days of user-local habit and prayer reminders,
delivers web push through Firebase Cloud Messaging, and records a separate
attempt for every active browser installation.

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis.
3. Run `pnpm install` and `pnpm db:migrate`.
4. Run `pnpm dev` to start both the API and notification worker.

You can still run `pnpm dev:api` and `pnpm dev:worker` in separate terminals
when you need to debug either process independently. Push and email delivery
jobs remain queued until `dev:worker` is running.

The API is served under `/v1`. Its versioned contract is available at
`/v1/openapi.json`. In non-production environments without a Resend key,
verification links are written as structured API logs.

Firebase is optional for local development. Without
`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, push deliveries are cancelled safely
instead of being reported as sent. Prayer calculations and in-app/email
notifications remain available.

## Firebase Cloud Messaging

1. Create a Firebase project and register a Web App.
2. Enable the Firebase Cloud Messaging HTTP v1 API and FCM Registration API.
3. Create/import a Web Push certificate and give its public VAPID key to the
   client.
4. Create a least-privilege service account that can send FCM messages.
5. Base64-encode the complete service-account JSON and store it only as the
   API and worker secrets `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` and
   `FIREBASE_STORAGE_BUCKET`. The service account needs Firebase Messaging
   access and permission to read, write, and delete objects in the avatar
   bucket.

Never expose the service-account JSON through a `NEXT_PUBLIC_*` variable. Bloom
uses Firebase Installation IDs and automatically deactivates unregistered,
invalid, or 30-day-stale installations.

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
`RESEND_API_KEY`, `EMAIL_FROM`, `ALLOWED_ORIGINS`,
`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, and observability secrets in Render.
Deploy the API migration before the worker when schema changes are introduced.

Native clients call the same auth endpoints and keep the returned bearer token
in platform-secure storage. The web client keeps it in a first-party HttpOnly
cookie through its Next.js proxy.
