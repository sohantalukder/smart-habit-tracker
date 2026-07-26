# Bloom Mobile

Bloom is the offline-first iOS and Android customer app for Smart Habit
Tracker. It is an independent React Native repository based on
`@sohantalukder/react-native-boilerplate` 1.0.14.

- Display name: `Bloom`
- Bundle/application ID: `com.sohantalukder.bloom`
- UI: `@sohantalukder/rn-kit` with `ThemeProvider` and `UiPortalProvider`
- Local source of truth: OP-SQLite with SQLCipher
- Navigation: Today, Habits, History, Inbox, and More

## Offline behavior

Every normal customer action updates encrypted SQLite immediately and writes a
durable mutation to the outbox in the same transaction. Sync runs after local
writes, verified connectivity restoration, app foregrounding, manual refresh,
authentication bootstrap, push receipt, and best-effort background callbacks.

The app pushes mutations in order, pulls cursor pages until complete, retries
transient failures with jittered backoff, and leaves rejected records visible as
`Needs attention`. Security-sensitive auth and account actions remain
online-only. Pending changes survive reauthentication for the same user.

iOS controls background execution and may throttle it; background fetch does
not run after the user force-quits the app. Foreground and restored-connectivity
sync are the deterministic paths.

## Setup

```bash
npm install
cd ios
pod install --repo-update
cd ..
```

Copy `.env.example` to `.env` and set `BLOOM_API_URL`. Development defaults are:

- iOS simulator: `http://localhost:4000/v1`
- Android emulator: `http://10.0.2.2:4000/v1`

For an Android physical device connected over USB:

```bash
adb reverse tcp:4000 tcp:4000
```

Add the Firebase files supplied by the release environment:

- `android/app/google-services.json`
- `ios/GoogleService-Info.plist`

They are intentionally ignored by Git. Bloom continues to run without those
files, but native push registration is unavailable.

## Run and verify

```bash
npm start
npm run android
npm run ios

npm run typecheck
npm test -- --runInBand
cd android && ./gradlew assembleDebug
```

Generate mobile API types after changing the server OpenAPI document:

```bash
npm run api:generate
```

## Data lifecycle

Each user receives a random 256-bit database key stored in the platform
keychain. Avatar files pending upload are copied into private app storage.
Logout requires either a successful sync or explicit discard when mutations are
pending. Final logout removes the encrypted database, its keychain key, cached
assets, and the local FCM token.

## Package availability note

The requested rn-kit `0.1.1` is documented by the hosted UI-kit site but is not
published in the npm registry. This repository pins the latest installable
package, `0.1.0`, while retaining the documented provider setup. Upgrade the pin
to `0.1.1` as soon as that package is published.
