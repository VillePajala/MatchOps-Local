# Privacy Policy for MatchOps

**Last Updated**: June 2026
**Policy Version**: 2026-06

> **Hosted URL**: https://match-ops.com/privacy-policy (use this URL for Play Store submission). `/privacy-policy` 301-redirects to the marketing-site privacy page at `/privacy` (`site/next.config.mjs`) — **takes effect on the next marketing-site deploy.**
>
> **Canonical source**: the live text is in the locale files (`public/locales/{en,fi}/common.json` and `site/public/locales/...` → `privacyPolicy.*`), rendered at `/privacy-policy` (app) and `/privacy` (site). Keep this snapshot in sync with those; it may lag the live text in places.

## Data Controller

MatchOps is developed and operated by Ville Pajala, based in Finland. As the data controller, we are responsible for the processing of your personal data as described in this policy.

## Overview

MatchOps ("we", "our", "the app") is a soccer coaching application that uses secure cloud sync. This privacy policy explains how we handle your information.

## Data Storage

### On-Device Data

Your data is also stored on your device for offline use, including:
- Player rosters and information
- Game records and statistics
- Settings and preferences
- Season and tournament data
- Personnel information (names, roles, contact details if you choose to enter them)

This on-device copy is protected by your device and is not directly accessible to us. The synced copy is stored in your private cloud account (see Cloud Sync below).

### Accounts

Using the app requires creating an account and signing in. Providing your email address to create the account is necessary to deliver the app and its cloud sync, and the service cannot be provided without it. Any other personal data you enter (players, personnel, game records) is provided at your own discretion.

### Cloud Sync

Your data is stored on our secure cloud servers:
- Copied to our secure EU-based servers (Supabase, hosted in EU)
- Encrypted in transit (HTTPS/TLS) and at rest
- Protected by row-level security (only you can access your data)
- Synced across your devices
- Retained under your full ownership

You can delete your cloud data at any time from Settings.

### Data Retention

- **Cloud data**: Retained while your account is active. When you delete your cloud data or your account, data is permanently removed within 30 days.
- **Post-cancellation**: If you cancel your cloud account, your cloud data remains accessible in read-only mode. After 90 days of account inactivity following cancellation, cloud data may be deleted.
- **Local data**: Remains on your device until you clear it yourself.
- **Consent records**: Retained even after account deletion for GDPR compliance (see below).

## Legal Basis for Data Processing (GDPR Art. 6)

We process personal data on the following legal bases:

- **Contract (Art. 6(1)(b))**: Processing necessary for cloud sync service delivery (when you enable cloud mode).
- **Consent (Art. 6(1)(a))**: Acceptance of Terms of Service and Privacy Policy for cloud mode users. Consent records are stored to demonstrate compliance.
- **Legitimate interest (Art. 6(1)(f))**: Error reporting via Sentry to maintain app quality and fix bugs. This processing involves minimal anonymized data and does not involve profiling or tracking. You can opt out in settings at any time. We do not carry out automated decision-making or profiling.

## Data We May Collect

### Error Reporting (Opt-Out)

When the app encounters an error, we may collect:
- Error type and stack trace
- Device type and OS version
- App version
- Anonymized session information

This helps us fix bugs and improve the app. Error reports:
- Do not contain your game data or player information
- Are processed by Sentry.io (data may be processed in the US under Standard Contractual Clauses)
- Can be disabled in app settings at any time

### Play Store License Validation (Legitimate Interest)

If premium features are offered in the future:
- Google Play handles all payment processing
- We verify license status through Play Store API
- We do not receive or store your payment information

### Consent Records (Cloud Mode)

When you accept our Terms of Service and Privacy Policy in Cloud Mode, we record:
- Date and time of consent
- Which policy version you accepted
- Your IP address (for legal verification)
- Your browser/device information

This information is required for GDPR compliance to prove that valid consent was obtained. Consent records are retained even after account deletion for legal purposes (legal obligation under GDPR Art. 7(1)).

### Personnel Data

When you add team personnel (coaches, assistants, medical staff), you may optionally enter:
- Name
- Role
- Email address (optional)
- Phone number (optional)
- Certifications (optional)

This data is stored:
- **Local mode**: On your device only — we have no access
- **Cloud mode**: In our secure EU-based database, accessible only to you

Personnel contact information (email, phone) is considered personally identifiable information (PII) under GDPR. You are responsible for ensuring you have appropriate grounds (e.g., the person's knowledge) to store their contact details. See the Data Security section below for how this data is protected.

## Data We Do NOT Collect

- Game content, scores, or statistics (stored locally only, or in your private cloud account)
- Location data
- Photos or media
- Device identifiers for tracking or advertising
- Player names or personal details (these are stored locally by you, or in your private cloud account)

Note: If you enter personnel contact information (email, phone), this is stored by your choice and under your control — see the Personnel Data section above.

## Third-Party Services (Sub-processors)

We use the following third-party services to operate MatchOps. Data processing agreements are in place with each provider where required.

| Service | Purpose | Data Location | Privacy Policy |
|---------|---------|---------------|----------------|
| **Google Play Store** | App distribution and payments | Google infrastructure | [Google Privacy Policy](https://policies.google.com/privacy) |
| **Sentry** | Error reporting and crash analysis | US (Standard Contractual Clauses) | [Sentry Privacy Policy](https://sentry.io/privacy/) |
| **Supabase** | Cloud database and authentication (cloud mode) | EU (Frankfurt) | [Supabase Privacy Policy](https://supabase.com/privacy) |
| **Vercel** | PWA web hosting | Global edge network (Standard Contractual Clauses) | [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) |

## Your Rights (GDPR)

Under GDPR and applicable data protection laws, you have the right to:

- **Access** (Art. 15): View and export all your data at any time using the app's export feature (Settings → Data → Your Data Rights)
- **Rectification** (Art. 16): Correct any inaccurate data directly in the app at any time
- **Erasure** (Art. 17): Delete your local data or cloud data at any time (Settings → Data → Your Data Rights)
- **Data portability** (Art. 20): Export your data in standard JSON format
- **Restriction** (Art. 18): Ask us to limit how we process your data, or delete your cloud data at any time from Settings
- **Objection** (Art. 21): Turn off optional error reporting in settings; to stop all cloud processing, delete your account
- **Withdraw consent**: Disable error reporting at any time in app settings; delete your cloud account to withdraw consent to cloud data processing

**How to exercise your rights**: All data management options are available directly in the app under Settings → Data tab. No email request is needed — you can self-serve all GDPR rights through the app interface.

**Right to lodge a complaint**: If you believe your data protection rights have been violated, you have the right to lodge a complaint with a supervisory authority. In Finland, this is the Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto): https://tietosuoja.fi/en/home

## Children's Privacy

MatchOps is a tool designed for adult coaches, not for use by children. The app does not knowingly collect personal information from children under 16.

Player names and statistics are entered by the coach (the app user), not by the players themselves. This data is stored locally on the coach's device or in their private cloud account and is never transmitted to us or any third party (except when cloud sync is enabled, in which case it is stored securely in the coach's private account).

No age verification is required because the app collects data *from coaches about their players*, not directly from children.

## Data Security

### Local Storage Security

On your device, your data is stored in the browser's IndexedDB database. This data:
- Is protected by your device's access controls (screen lock, password, biometrics)
- Is NOT additionally encrypted at rest beyond what your device/browser provides
- Could theoretically be accessed by someone with physical access to your unlocked device

This is industry standard for on-device storage and is appropriate for coaching data. If you store personnel contact information (email, phone numbers), please be aware this data follows the same security model.

**Your device's security is your primary protection for local data.** We recommend using a strong screen lock.

### Cloud Storage Security

In cloud mode, your data is:
- Encrypted in transit (HTTPS/TLS)
- Encrypted at rest in secure EU-based servers (Supabase, Frankfurt)
- Protected by row-level security (only you can access your data)
- Backed by Supabase's security infrastructure and SOC 2 compliance

### Backup File Security

When you export your data, the backup file:
- Contains all your data including any personnel contact information
- Is NOT encrypted
- Should be stored securely and not shared publicly

We recommend storing backup files in a secure location and deleting them after import to another device.

## Changes to This Policy

We may update this policy when necessary. Material changes will:
- Update the "Last Updated" date and Policy Version
- Trigger a re-consent prompt for cloud mode users on their next sign-in
- Be available for review before acceptance

## Contact

Most data requests can be handled directly in the app (Settings → Data tab) without contacting us.

For other privacy questions or concerns:
- Email: support@match-ops.com

---

*This privacy policy applies to the MatchOps application available on Google Play Store.*
