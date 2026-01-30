# Privacy Policy for MatchOps

**Last Updated**: January 2026

> **Hosted URL**: https://matchops.com/privacy-policy (use this URL for Play Store submission)

## Overview

MatchOps ("we", "our", "the app") is a local-first soccer coaching application. This privacy policy explains how we handle your information.

## Data Storage

### Local Data (Local Mode)
When using local mode, your data is stored on your device:
- Player rosters and information
- Game records and statistics
- Settings and preferences
- Season and tournament data
- Personnel information (names, roles, contact details)

**We do not have access to this data.** It never leaves your device unless you explicitly export it or enable cloud sync.

### Cloud Data (Cloud Mode with Subscription)
When you enable cloud sync with a subscription, your data is:
- Copied to our secure EU-based servers (Supabase)
- Encrypted in transit (HTTPS/TLS)
- Protected by row-level security (only you can access your data)
- Synced across your devices

### Account Requirement
MatchOps requires an account to use the app. Your account:
- Provides a unique identifier for your data
- Enables data isolation on shared devices
- Allows optional cloud sync (paid subscription required)

## Data We May Collect

### Error Reporting (Optional)
When the app encounters an error, we may collect:
- Error type and stack trace
- Device type and OS version
- App version
- Anonymized session information

This helps us fix bugs and improve the app. Error reports:
- Do not contain your game data or player information
- Are processed by Sentry.io (see their privacy policy)
- Can be disabled in app settings

### Play Store License Validation
When you purchase premium features:
- Google Play handles all payment processing
- We verify license status through Play Store API
- We do not receive your payment information

### Consent Records (Cloud Mode)
When you accept our Terms of Service and Privacy Policy in Cloud Mode, we record:
- Date and time of consent
- Which policy version you accepted
- Your IP address (for legal verification)
- Your browser/device information

This information is required for GDPR compliance to prove that consent was obtained. Consent records are retained even after account deletion for legal purposes.

### Personnel Data
When you add team personnel (coaches, assistants, medical staff), we store:
- Name
- Role
- Email address (optional)
- Phone number (optional)
- Certifications (optional)

This data is stored:
- **Local mode**: On your device only - we have no access
- **Cloud mode**: In our secure database, accessible only to you

Personnel contact information (email, phone) is considered personally identifiable information (PII) under GDPR. See the Data Security section below for how this data is protected.

## Data We Do NOT Collect

- Game content, scores, or statistics (stored locally only, or in your cloud account if enabled)
- Location data
- Photos or media
- Device identifiers for tracking

## Third-Party Services

### Google Play Store
- Handles app distribution and payments
- See Google's Privacy Policy: https://policies.google.com/privacy

### Sentry (Error Reporting)
- Processes crash reports and errors
- See Sentry's Privacy Policy: https://sentry.io/privacy/

### Vercel (Web Hosting)
- Hosts the PWA version
- See Vercel's Privacy Policy: https://vercel.com/legal/privacy-policy

## Your Rights

You can:
- **Export your data** using the app's export feature
- **Delete your data** by clearing app data or uninstalling
- **Disable error reporting** in app settings

## Children's Privacy

MatchOps does not knowingly collect information from children. The app stores player names locally as entered by the coach - these are controlled entirely by you and never transmitted to us.

## Data Security

### Local Storage Security
In local mode, your data is stored in your browser's IndexedDB database. This data:
- Is protected by your device's access controls (screen lock, password, biometrics)
- Is NOT additionally encrypted at rest beyond what your device provides
- Could theoretically be accessed by someone with physical access to your unlocked device

This is industry standard for local-first applications and is appropriate for coaching data. If you store personnel contact information (email, phone numbers), please be aware this data follows the same security model.

**Your device's security is your primary protection for local data.** We recommend using a strong screen lock.

### Cloud Storage Security
In cloud mode, your data is:
- Encrypted in transit (HTTPS/TLS)
- Stored in secure EU-based servers (Supabase)
- Protected by row-level security (only you can access your data)
- Backed by Supabase's security infrastructure

### Backup File Security
When you export your data, the backup file:
- Contains all your data including personnel contact information
- Is NOT encrypted
- Should be stored securely and not shared publicly

We recommend storing backup files in a secure location and deleting them after import to another device.

## Changes to This Policy

We may update this policy occasionally. Changes will be noted by the "Last Updated" date.

## Contact

For privacy questions or concerns:
- Email: valoraami@gmail.com
- GitHub Issues: https://github.com/VillePajala/MatchOps-Local/issues

---

*This privacy policy applies to the MatchOps application available on Google Play Store.*
