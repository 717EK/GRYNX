# GRYNX — Android APK (native testing)

The app is a PWA and is already **APK-ready** (valid manifest, 192/512 + maskable
icons, `standalone`, served over HTTPS on Vercel). To get an installable Android
APK you wrap the live PWA in a **TWA** (Trusted Web Activity) — a thin native
shell that opens the PWA full-screen with the Chrome engine, so camera + WebAuthn
biometrics work natively and permission is asked once.

## Fastest path — PWABuilder (no toolchain, ~5 min)

1. Open https://www.pwabuilder.com
2. Enter the live URL: `https://grynx-gamma.vercel.app` → **Start**.
3. Click **Package for stores → Android**.
4. Set **Package ID** to `in.dlyft.grynx` (matches `public/.well-known/assetlinks.json`).
   Leave "signing key" on **"Create new"** (PWABuilder generates + stores it).
5. **Download** → you get a `.zip` with:
   - `app-release-signed.apk`  ← sideload this on the phone to test
   - `app-release-bundle.aab`  ← for the Play Store later
   - `assetlinks.json` + the **SHA-256 fingerprint** of the signing key.
6. Install the APK on the Android phone: copy it over, tap it, allow
   "Install unknown apps" for your file manager/browser.

That's it for testing. The first launch may briefly show a URL bar until domain
verification is done (next section) — functionally everything works regardless.

## Remove the URL bar (domain verification, one-time)

The TWA hides Chrome's address bar only once the domain confirms it trusts the
app's signing key, via Digital Asset Links:

1. From PWABuilder's download, copy the **SHA-256 fingerprint**.
2. Paste it into `public/.well-known/assetlinks.json` (replace
   `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER`). Keep `package_name` =
   `in.dlyft.grynx` (or whatever Package ID you chose in step 4).
3. Commit + push → Vercel serves it at
   `https://grynx-gamma.vercel.app/.well-known/assetlinks.json`.
4. Reinstall the APK. The URL bar is gone.

## When you move to the Mac Mini

The TWA points at whatever URL you packaged. If you later serve the frontend
from the Mac Mini's domain (Cloudflare Pages/Tunnel), re-package against that URL
and host its `assetlinks.json` there too. (You can also keep hosting the PWA on
Vercel and only move the **API** to the Mac Mini — then the APK URL doesn't
change; just point `VITE_API_BASE` at the Mini.)

## Alternative — local build (Bubblewrap CLI)

If you'd rather build locally (needs JDK 17 + Android SDK installed):

```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://grynx-gamma.vercel.app/manifest.webmanifest
bubblewrap build      # produces app-release-signed.apk
```

PWABuilder is recommended for first testing because it needs nothing installed.
