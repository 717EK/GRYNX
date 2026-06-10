# GRYNX — Capacitor Android app

The Vite PWA is wrapped with **Capacitor** into a native Android app. The web
codebase is reused as-is (bundled offline shell); the app still calls the API
over the network via the `VITE_API_BASE` baked into the build.

## What's already wired (in this repo)

- `capacitor.config.ts` — appId `in.dlyft.grynx`, `webDir: dist`, bundled shell.
- `android/` — the native project (committed; build outputs are gitignored).
- Plugins installed + synced: **push-notifications, local-notifications, camera,
  filesystem, app, status-bar, splash-screen**.
- `src/lib/native.ts` — startup bootstrap (no-op on web): status bar, splash,
  **FCM registration** → sends the device token to the API, creates a
  high-importance notification channel (`grynx_default`).
- API: `PushToken` model + `POST /api/v1/devices/register` (+ `/unregister`),
  and `src/lib/fcm.ts` — every existing notification event now ALSO fans out as
  an FCM push (one source of truth; see `notify.ts`).
- `AndroidManifest.xml` — CAMERA, POST_NOTIFICATIONS, VIBRATE permissions.

Biometric (WebAuthn) and QR scanning (html5-qrcode) are **reused from the web
layer** for now — they run in the Capacitor WebView. Swap to native plugins
(`capacitor-native-biometric`, `@capacitor-mlkit/barcode-scanning`) only if the
WebView versions misbehave on real devices.

## Prerequisites

- Node 20+, Android Studio (latest), JDK 17, Android SDK 35/36.

## Build & run (dev)

```
npm run build          # produce dist/
npx cap sync android   # copy dist + plugins into android/
npx cap open android   # opens Android Studio → press Run on a device/emulator
```
Re-run `npm run build && npx cap sync android` after any web change.

## Firebase Cloud Messaging (push) — one-time setup

Push is **off until you configure Firebase** (the app + API run fine without it).

1. Firebase console → create project → add an **Android app** with package
   `in.dlyft.grynx`.
2. Download **`google-services.json`** → place it at `android/app/google-services.json`.
3. Enable the Google Services Gradle plugin:
   - `android/build.gradle` (project), in `dependencies`:
     `classpath 'com.google.gms:google-services:4.4.2'`
   - `android/app/build.gradle`, at the **top** add:
     `apply plugin: 'com.google.gms.google-services'`
4. Backend: set **`FIREBASE_SERVICE_ACCOUNT`** (the service-account JSON as a
   single-line string) on the API (Render dashboard / Mac Mini env). Get it from
   Firebase → Project settings → Service accounts → Generate new private key.
   (Alternatively set `GOOGLE_APPLICATION_CREDENTIALS` to its file path.)
5. Rebuild: `npm run build && npx cap sync android`, run from Android Studio.

That's it — every job/PPC/maintenance notification now also arrives as a push,
even when the app is closed.

### Custom chime
Drop a sound at `android/app/src/main/res/raw/chime.wav`, then in
`src/lib/native.ts` set `sound: 'chime'` in `createChannel`, and in
`api/src/lib/fcm.ts` set `notification.sound` to `chime`. Rebuild + sync.

## Release (Play Store)

```
# generate a release keystore once (keep it safe + out of git):
keytool -genkey -v -keystore grynx-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias grynx
```
In Android Studio: Build → Generate Signed Bundle/APK → **Android App Bundle
(.aab)** for Play, or APK for sideload testing. Set the version in
`android/app/build.gradle` (`versionCode` / `versionName`). Fill the Play
Console **Data safety** form (camera, notifications). targetSdk is 36 (Android 16,
satisfies Play's Android-15 requirement).

## When the server moves to the Mac Mini

Only the API URL changes. Rebuild the web with `VITE_API_BASE` pointing at the
Mac Mini, `npm run build && npx cap sync android`, ship a new app version. (Or
add a LAN-first endpoint race so the same build picks the fastest reachable API.)
