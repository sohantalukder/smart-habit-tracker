# Smart Habit Client

The standalone Next.js customer application for Bloom. It uses the NestJS
backend for first-party signup, email verification, login, sessions, and habit
data. The support portal is served from `/admin`.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `API_URL` to the backend `/v1` URL.
3. Run `pnpm install`, then `pnpm dev`.

Firebase variables may be left empty during normal UI development. With them
unset, onboarding explains that push is not configured while habits, prayer
times, prayer tracking, and the in-app inbox remain functional.

The browser never receives the backend session token. Next.js stores it in a
Secure, HttpOnly, SameSite=Lax cookie and proxies authenticated requests through
same-origin route handlers.

## API contract

`openapi/openapi.json` is a pinned copy of the backend release contract. Run
`pnpm api:generate` whenever that snapshot changes. The generated
`lib/api/generated.ts` file is committed so the web build never depends on a
running backend.

## Vercel

Import this repository as one Vercel project. Configure:

- `NEXT_PUBLIC_SITE_URL` with the production Vercel URL.
- `API_URL` with the Render API URL ending in `/v1`.
- `NEXT_PUBLIC_SENTRY_DSN` when browser observability is enabled.
- The Firebase Web App values:
  `NEXT_PUBLIC_FIREBASE_API_KEY`,
  `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
  `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
  `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`,
  `NEXT_PUBLIC_FIREBASE_APP_ID`, and
  `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

No database, Redis, Resend, or bearer-session secrets belong in the Vercel
project. The Firebase Web App configuration and VAPID public key are public
client configuration; the Firebase service-account JSON belongs only on the
Render worker.
