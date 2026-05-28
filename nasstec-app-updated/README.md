# نص تك — NassTec OCR App

Capacitor-based Android app for Arabic/English OCR with AI text extraction.

---

## What's in this repo

| Path | Purpose |
|------|---------|
| `www/` | Web source (index.html, app.html, JS modules) |
| `resources/` | Master assets for `@capacitor/assets` (icon 1024×1024, splash 2732×2732) |
| `android-icons/` | Pre-generated mipmap + splash PNGs (from real logo) |
| `android-patch/` | AndroidManifest permission snippet + drawable splash |
| `.github/workflows/build-apk.yml` | CI: installs, syncs, generates assets, injects permissions, builds APK |

---

## Changes applied (v2)

### ✅ App icon & splash — real NassTec logo
All icon/splash assets are now generated from `www/logo.jpg` (the real NassTec logo),
not a placeholder "NT" graphic. Both the CI pipeline and the `resources/` folder use
`@capacitor/assets` for generation.

### ✅ Start screen (`index.html`)
- **"بدون إنترنت" removed** from tagline and features row
- `nasstec-permissions.js` and `nasstec-arabic-tts.js` loaded via `<script>` tags

### ✅ In-app splash (`app.html`)
- Splash ring now shows the actual **logo.jpg** image instead of an SVG placeholder
- Permission + TTS scripts already present

### ✅ Android permissions (`AndroidManifest.xml`)
The CI workflow injects these automatically:
```xml
CAMERA · READ_EXTERNAL_STORAGE · WRITE_EXTERNAL_STORAGE
READ_MEDIA_IMAGES · READ_MEDIA_VIDEO · READ_MEDIA_AUDIO · INTERNET
```
The in-app rationale dialog (`nasstec-permissions.js`) requests them at runtime.

### ✅ Arabic TTS v2 — works in WebView without Chrome
`www/nasstec-arabic-tts.js` engine cascade:
1. **Web Speech API** — uses device TTS engine (Google TTS pre-installed on Android).
   Fully **offline**, no Chrome required.
2. **Capacitor Community TTS plugin** — native offline TTS (optional install).
3. **ResponsiveVoice CDN** — online fallback, no API key.
4. **Audio URL fallback** — last resort, online.

---

## Local dev

```bash
npm install
npx cap sync android
npx cap open android          # opens Android Studio
```

### Regenerate icons locally
```bash
npm run assets
# or manually:
npx @capacitor/assets generate \
  --iconBackgroundColor '#0a0a0a' \
  --splashBackgroundColor '#0a0a0a' \
  --assetPath resources \
  --android
```
> Requires `resources/icon.png` (1024×1024) and `resources/splash.png` (2732×2732).
> Both are committed to the repo and built from `www/logo.jpg`.

---

## Optional: add native TTS (fully offline, best quality)

```bash
npm install @capacitor-community/text-to-speech
npx cap sync android
```

`NassTecTTS` will automatically detect the plugin and use it as Engine 2.
