# DPPL Sales Tracker — Android app

A small native WebView shell (Java, no Gradle and no AndroidX) around the web app.

- **Package:** `in.devendranplastic.salestracker`
- **App name:** DPPL Sales Tracker
- **Android versions:** minSdk 24 (Android 7.0), targetSdk 35

## Build
```bash
source /home/box/flutter-env.sh          # JAVA_HOME + ANDROID_HOME
android/build.sh                          # -> dist/DPPL_Sales_Tracker.apk (signed)
VERSION_NAME=1.0.1 VERSION_CODE=2 android/build.sh       # next release (bump VERSION_CODE every time)
APP_URL=https://<your-site>.netlify.app/ android/build.sh  # load a hosted site instead of the bundled files
```
- **Default `APP_URL=local`:** the web files (`index.html`, `*.js`, `style.css`, `assets/`) are bundled into the APK, together with pinned copies of supabase-js 2.119.0, SheetJS 0.20.3 and Chart.js 4.4.4. They are served at `https://appassets.androidplatform.net/www/`, so the app starts quickly, and Supabase stays the live backend through `config.js`. **Rebuild the APK whenever the web app changes.**
- **Hosted URL instead:** with `APP_URL` set to a hosted site, the APK always shows the latest deployed version and needs the internet to load.
- **Signing:** the keystore and its passwords are kept outside the repo, in `/workspace/dppl-crm-keys/` (`keystore.properties` and `dppl-release.jks`). Back these up. Every future update must be signed with the same key, or Android will refuse to install it over the old app.

## Features
- **Launcher icon:** adaptive icon made from the DPPL emblem.
- **Splash screen:** the system splash shows the emblem (Android 12+), followed by the full DPPL logo until the page loads.
- **File upload:** the file chooser and the camera work for PO and invoice copies (PDF or image) and for CSV/Excel imports.
- **Downloads:** CSV and Excel exports, and any blob or data link, are saved to *Downloads/DPPL* with Open and Share buttons. Downloads from http(s) links go through DownloadManager.
- **Back button:** steps back through the app's own screens (`window.appBack`), then the WebView history. Pressing back twice exits the app.
- **External links:** WhatsApp (`wa.me`), `mailto:`, `tel:` and links to other sites open in the matching app or the browser.
