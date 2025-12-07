# TWA Build Guide for Play Store

This guide explains how to build MatchOps-Local as a Trusted Web Activity (TWA) for Google Play Store distribution.

## Prerequisites

1. **Android Studio** with SDK installed
2. **Java JDK** 11 or higher
3. **Node.js** 18+
4. **Google Play Console** developer account ($25 one-time fee)

## Overview

A Trusted Web Activity (TWA) wraps a PWA in an Android app container. When the Digital Asset Links are verified, the app runs in full-screen mode without the browser address bar.

## Step 1: Generate Signing Key

```bash
# Generate a new keystore (only do this once - KEEP THIS SAFE!)
keytool -genkey -v -keystore matchops-release.keystore \
  -alias matchops-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=MatchOps, OU=Development, O=MatchOps, L=Helsinki, ST=Uusimaa, C=FI"
```

⚠️ **IMPORTANT**:
- Store the keystore file securely
- Never commit it to git
- Back it up - you CANNOT update your app without it
- Add to `.gitignore`: `*.keystore`, `*.jks`

## Step 2: Get SHA256 Fingerprint

```bash
# Get the SHA256 fingerprint for assetlinks.json
keytool -list -v -keystore matchops-release.keystore -alias matchops-key \
  -storepass YOUR_STORE_PASSWORD | grep SHA256
```

Output will look like:
```
SHA256: AB:CD:EF:12:34:56:78:90:...
```

## Step 3: Update Asset Links

Update `public/.well-known/assetlinks.json` with your actual fingerprint:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.matchops.local",
      "sha256_cert_fingerprints": [
        "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90"
      ]
    }
  }
]
```

## Step 4: Deploy and Verify

1. Deploy the app to production (Vercel)
2. Verify asset links are accessible:
   ```bash
   curl -I https://matchops-local.vercel.app/.well-known/assetlinks.json
   ```
3. Use Google's verification tool:
   https://developers.google.com/digital-asset-links/tools/generator

## Step 5: Build TWA with PWABuilder (Recommended)

The easiest way to build a TWA is using PWABuilder:

1. Go to https://www.pwabuilder.com/
2. Enter your production URL: `https://matchops-local.vercel.app`
3. Click "Build My PWA"
4. Select "Android" → "Generate Package"
5. Configure:
   - **App name**: MatchOps
   - **Package ID**: com.matchops.local
   - **Signing key**: Use the keystore generated in Step 1
6. Download the AAB (Android App Bundle)

## Alternative: Build with Bubblewrap CLI

```bash
# Install Bubblewrap
npm install -g @nicolo-ribaudo/nicolo-aspect-cli

# Initialize TWA project
npx bubblewrap init --manifest https://matchops-local.vercel.app/manifest.json

# Follow the prompts:
# - Package name: com.matchops.local
# - App name: MatchOps
# - Use existing keystore: yes

# Build the AAB
npx bubblewrap build
```

## Step 6: Test the APK/AAB

```bash
# Install APK for testing (not AAB)
adb install app-release.apk

# Or use Android Studio's emulator
```

Verify:
- App opens without address bar (Digital Asset Links working)
- All features work correctly
- PWA installation prompt doesn't appear
- Service worker updates work

## Step 7: Upload to Play Console

1. Go to https://play.google.com/console
2. Create new app or update existing
3. Upload the AAB file
4. Complete store listing (see PR #5: Store Listing Assets)
5. Submit for review

## Troubleshooting

### Address Bar Showing

If the address bar appears, Digital Asset Links verification failed:

1. Check `assetlinks.json` is accessible
2. Verify SHA256 fingerprint matches your signing key
3. Check Content-Type header is `application/json`
4. Clear app data and reinstall

### "App not installed" Error

1. Check minimum SDK version (TWA requires API 19+)
2. Ensure package name matches assetlinks.json
3. Verify signing key is correct

### Asset Links Not Found

1. Ensure the file is at `/.well-known/assetlinks.json`
2. Check CORS headers allow Google to fetch
3. Verify production deployment includes the file

## File Structure

```
public/
  .well-known/
    assetlinks.json      # Digital Asset Links for TWA verification
  manifest.json          # PWA manifest
  sw.js                  # Service worker
  icons/
    icon-192x192.png     # App icon
    icon-512x512.png     # High-res icon
```

## Security Notes

- The keystore is like your app's identity - protect it
- Use Play App Signing for additional security
- Rotate keys periodically if possible
- Never commit passwords to git

## Related Documentation

- [PWABuilder Documentation](https://docs.pwabuilder.com/)
- [Bubblewrap CLI](https://github.com/GoogleChrome/bubblewrap)
- [Digital Asset Links](https://developers.google.com/digital-asset-links)
- [Play Console Help](https://support.google.com/googleplay/android-developer)
