#!/usr/bin/env bash
# Builds the signed DPPL Sales Tracker APK without Gradle (Android SDK build-tools only).
#   APP_URL=local (default)  -> bundles the web app (index.html, *.js, css, assets + vendored CDN libs) inside the APK;
#                               Supabase stays the live backend (config.js USE_SUPABASE).
#   APP_URL=https://<site>/  -> thin shell that loads the hosted site (e.g. the Netlify URL).
#   VERSION_NAME=1.0.0 VERSION_CODE=1   KEYS=/workspace/dppl-crm-keys (keystore.properties + .jks, never in git)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WEB="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_HOME:-/home/box/android-sdk}"; BT="${BUILD_TOOLS:-$SDK/build-tools/36.0.0}"; PLATFORM="${PLATFORM_JAR:-$SDK/platforms/android-35/android.jar}"
JAVA_HOME="${JAVA_HOME:-/home/box/jdk/jdk-17.0.21+9}"; export PATH="$JAVA_HOME/bin:$PATH"
APP_URL="${APP_URL:-local}"; VERSION_NAME="${VERSION_NAME:-1.0.0}"; VERSION_CODE="${VERSION_CODE:-1}"
KEYS="${KEYS:-/workspace/dppl-crm-keys}"; OUT="${OUT:-$WEB/dist/DPPL_Sales_Tracker.apk}"
B="$HERE/build"; rm -rf "$B"; mkdir -p "$B"/{assets/www,gen,classes,res-gen/values,compiled}

# 1) web assets
if [ "$APP_URL" = "local" ]; then
  START="https://appassets.androidplatform.net/www/index.html"
  cp "$WEB"/index.html "$WEB"/config.js "$WEB"/style.css "$B/assets/www/"
  for f in "$WEB"/*.js; do cp "$f" "$B/assets/www/"; done
  mkdir -p "$B/assets/www/assets"; cp "$WEB"/assets/*.png "$B/assets/www/assets/"
  V="$HERE/vendor-cache"; mkdir -p "$V" "$B/assets/www/vendor"
  get(){ [ -s "$V/$1" ] || curl -fsSL "$2" -o "$V/$1"; cp "$V/$1" "$B/assets/www/vendor/$1"; }
  get supabase.min.js     https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js
  get xlsx.full.min.js    https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
  get chart.umd.min.js    https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js
  cp "$HERE/assets/android-hooks.js" "$B/assets/www/android-hooks.js"
  python3 - "$B/assets/www/index.html" <<'PY'
import sys,re
p=sys.argv[1];s=open(p).read()
for url,loc in [('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js','vendor/supabase.min.js'),
                ('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','vendor/xlsx.full.min.js'),
                ('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js','vendor/chart.umd.min.js')]:
    assert url in s, url; s=s.replace(url,loc)
s=s.replace('<head>','<head><script src="android-hooks.js"></script>',1)
open(p,'w').write(s)
PY
else
  START="$APP_URL"
fi
cp "$HERE/assets/android-hooks.js" "$B/assets/android-hooks.js"
cat > "$B/res-gen/values/config.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources><string name="start_url" translatable="false">$START</string></resources>
XML

# 2) resources + manifest
sed -e "s/@VERSION_CODE@/$VERSION_CODE/" -e "s/@VERSION_NAME@/$VERSION_NAME/" "$HERE/AndroidManifest.xml" > "$B/AndroidManifest.xml"
"$BT/aapt2" compile --dir "$HERE/res" -o "$B/compiled/res.zip"
"$BT/aapt2" compile --dir "$B/res-gen" -o "$B/compiled/gen.zip"
"$BT/aapt2" link -I "$PLATFORM" --manifest "$B/AndroidManifest.xml" -A "$B/assets" --java "$B/gen" \
  --min-sdk-version 24 --target-sdk-version 35 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -o "$B/unsigned.apk" "$B/compiled/res.zip" "$B/compiled/gen.zip"

# 3) code
javac -nowarn -Xlint:-options -source 1.8 -target 1.8 -bootclasspath "$PLATFORM:$BT/core-lambda-stubs.jar" -d "$B/classes" \
  $(find "$HERE/src" "$B/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$B" $(find "$B/classes" -name '*.class')
python3 -c "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED);z.write(sys.argv[2],'classes.dex');z.close()" "$B/unsigned.apk" "$B/classes.dex"

# 4) align + sign
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
PROPS="$KEYS/keystore.properties"; [ -f "$PROPS" ] || { echo "missing $PROPS" >&2; exit 1; }
STORE=$(grep '^storeFile=' "$PROPS" | cut -d= -f2-); ALIAS=$(grep '^keyAlias=' "$PROPS" | cut -d= -f2-)
export DPPL_KS_PASS=$(grep '^storePassword=' "$PROPS" | cut -d= -f2-); export DPPL_KEY_PASS=$(grep '^keyPassword=' "$PROPS" | cut -d= -f2-)
mkdir -p "$(dirname "$OUT")"
"$BT/apksigner" sign --ks "$STORE" --ks-key-alias "$ALIAS" --ks-pass env:DPPL_KS_PASS --key-pass env:DPPL_KEY_PASS \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out "$OUT" "$B/aligned.apk"
unset DPPL_KS_PASS DPPL_KEY_PASS
"$BT/apksigner" verify --print-certs "$OUT" | grep -E "Signer #1 certificate (DN|SHA-256)"
echo "Built $OUT ($(du -h "$OUT" | cut -f1)) version $VERSION_NAME ($VERSION_CODE) start=$START"
