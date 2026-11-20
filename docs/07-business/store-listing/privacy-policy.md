# Privacy Policy for MatchOps

**Last Updated**: November 2026
**Policy Version**: 2026-11

> **Hosted URL**: https://match-ops.com/privacy-policy (use this URL for Play Store submission). It redirects to the marketing-site privacy page `https://www.match-ops.com/privacy` (`site/next.config.mjs`) - verified live 2026-11-20. The app also renders it at `https://app.match-ops.com/privacy-policy`.
>
> **Canonical source**: the live text is in the locale files (`public/locales/{en,fi}/common.json` and `site/public/locales/...` → `privacyPolicy.*`), rendered at `/privacy-policy` (app) and `/privacy` (site). This file is an English snapshot of the app text, regenerated 2026-11-20 for version 2026-11; if it differs from the locale files, the locale files win.

## Data Controller

MatchOps is developed and operated by Ville Pajala, based in Finland. We are the controller of your account data (your email, settings, consent records) and of the error reports and usage statistics described below. For the personal data you enter about other people (players, staff), you - or the club you act for - are the controller and we act as your processor (see Data Processing in the Terms of Service).

## Overview

MatchOps ("we", "our", "the app") is a soccer coaching application that uses secure cloud sync. This privacy policy explains how we handle your information.

## Data Storage

### On-Device Data

Your data is also stored on your device for offline use, including:

- Player rosters and information
- Game records and statistics
- Settings and preferences
- League and tournament data
- Personnel information (names, roles, contact details if you choose to enter them)

This on-device copy is protected by your device and is not directly accessible to us. The synced copy is stored in your private cloud account (see Cloud Sync below).

### Accounts

Using the app requires creating an account and signing in. Providing your email address to create the account is necessary to deliver the app and its cloud sync, and the service cannot be provided without it. Any other personal data you enter (players, personnel, game records) is provided at your own discretion.

### Cloud Sync

Your data is stored on our secure cloud servers:

- Stored on Supabase servers in the EU (Stockholm, Sweden)
- Encrypted in transit (HTTPS/TLS) and at rest
- Protected by row-level security: through the app, each account can reach only its own data
- Synced across your devices
- Retained under your full ownership

Cloud data is stored in EU data centres (Stockholm, Sweden). You can delete your cloud data or your whole account at any time in Settings → Data.

Who can see your data: you. As the operator we technically have administrator access to the database, but we do not look at your content. We access it only when you ask us to (for example to solve a problem you report) or when the law requires it.

### Data Retention

Your cloud data is kept while your account exists. When you delete your cloud data or your account (Settings → Data), it is removed from the live database immediately; any copy in our hosting provider's backups is removed when that backup expires (at most 30 days). Deleting your account also deletes your consent records. If an account is unused for a long time, we may delete its cloud data after notifying you first. Data on your device stays there until you delete it or clear the app's storage. Error reports are deleted by Sentry automatically within at most 90 days.

## Legal Basis for Data Processing (GDPR Art. 6)

We process personal data on the following legal bases:

- Contract (Art. 6(1)(b)): providing the service you signed up for - your account and email address, storing and syncing your data, and the account emails the service needs (sign-up confirmation, password reset).
- Consent (Art. 6(1)(a)): only for marketing emails (see Marketing Emails) and for connecting your own AI provider (see Voice Notes and Optional AI). You can withdraw consent at any time; withdrawal does not affect earlier processing.
- Legitimate interest (Art. 6(1)(f)): error reporting via Sentry to find and fix bugs, and onboarding milestones to improve how new coaches get started - both can be turned off in Settings → Data → Error reporting and usage statistics. Keeping the record of your acceptance of the Terms of Service and this Privacy Policy is also based on our legitimate interest in being able to demonstrate it (accountability, Art. 5(2)). None of this involves profiling or tracking, and we make no automated decisions about you.

## Data We May Collect

### Error Reporting and Usage Statistics

Unless you turn it off, Sentry receives the following from the app:

- When an error happens: the error type and stack trace
- Device type, browser and operating system version
- App version
- A pseudonymous session identifier, not linked to your account or email
- When an error happens: a replay of the screen in the moments before it, with all text and images masked
- Performance traces for a sample of page loads and screen changes (about 1 in 10): timings and the app address visited

This is pseudonymous data, not anonymous. We use it only to find and fix bugs and keep the app fast. Reports are built to leave out your game data and player information: text and images are masked in replays, and keys and sign-in data are scrubbed before sending. Sentry processes it in the US under Standard Contractual Clauses. You can turn this off at any time in Settings → Data → Error reporting and usage statistics; from then on the app on your device sends Sentry no error reports or usage statistics. Our servers report their own errors to Sentry separately; those reports contain no account data.

### Play Store License Validation

If paid features are introduced, Google Play will handle all payment processing. We verify license status through Play Store API but do not receive your payment information.

### Consent Records

When you accept the Terms of Service and this Privacy Policy, or grant or withdraw marketing consent, we record:

- What you accepted, granted or withdrew (terms and privacy, or marketing emails)
- Date and time
- Which policy version was in force
- Your browser and device information

We keep these records to be able to demonstrate your acceptance and your marketing choices (GDPR Art. 5(2) and 7(1)) while your account exists. They are deleted together with your account and are included in your data export.

### Personnel Data

When you add team personnel (coaches, assistants, medical staff), you may optionally enter:

- Name and role
- Email address (optional)
- Phone number (optional)
- Certifications (optional)

This data is stored on your device and synced to your cloud account in the EU (Stockholm, Sweden). Staff contact details (email, phone) are personal data under GDPR. For any personal data you enter about other people (such as players and staff), you - or the club you act for - are the controller and are responsible for having a lawful basis to store it and for informing the people concerned; we process it only on your behalf (see Data Processing in the Terms of Service).

### Onboarding Progress and Layout

Unless you turn it off, we store a few timestamps about your onboarding progress (account created, setup finished or skipped, first plan seen, first and second match finished) in your account settings, together with your chosen layout (Basic or Full). We use the timestamps only to improve how new coaches get started. They contain none of your game data, are never shared or sold, and are deleted with your account. To object, turn off Settings → Data → Error reporting and usage statistics: no further timestamps are then recorded. The layout is a setting of the app and is always kept.

## What We Do Not Do With Your Data

- Your games, scores and statistics: we store them only to provide the app and its sync. We never use, analyse, share or sell them.
- Your device's location: the app never reads it (no GPS). Places you choose to save - match venues and your team's starting point, with their address and map pin - are stored as part of your data to show travel and departure times. Searching for a place sends the text you type to Photon, and filling in a missing venue address sends that saved pin's coordinates (see Third-Party Services and Recipients).
- Photos or media: the app does not collect them.
- Tracking or advertising: the app has no ads and no advertising or analytics trackers, and uses no device identifiers for them.
- Player names, notes and other details about people: the same - stored only to provide the sync, never used, analysed, shared or sold.

Note: staff contact details (email, phone) you enter are stored by your choice and under your control - see Personnel Data above.

## Third-Party Services and Recipients

Supabase, Sentry, Resend and Vercel are our sub-processors; data processing agreements are in place with each of them. Google Play, Photon, palloliitto.fi and an AI provider you connect are not our sub-processors: they receive data directly from your device, only when you use them (for Photon, also the automatic venue address lookup described below), under their own terms.

**Google Play Store** - App distribution and payments (Google infrastructure). [Google's Privacy Policy](https://policies.google.com/privacy)

**Sentry** - Error reports, error replays and performance traces from the app on your device, unless you turn them off; error reports from our servers, which contain no account data (US, Standard Contractual Clauses). [Sentry's Privacy Policy](https://sentry.io/privacy/)

**Supabase** - Cloud database and authentication, hosted in the EU (Stockholm, Sweden). [Supabase's Privacy Policy](https://supabase.com/privacy)

**Vercel** - Hosting of the app and the website. Like any web host it processes your IP address in its request logs (global edge network, Standard Contractual Clauses). [Vercel's Privacy Policy](https://vercel.com/legal/privacy-policy)

**Resend** - Sends the account emails (sign-up confirmation, password reset) from noreply@auth.match-ops.com and, if you opt in, marketing emails. It receives your email address and the message (may be processed in the US under Standard Contractual Clauses). [Resend's Privacy Policy](https://resend.com/legal/privacy-policy)

**Photon (Komoot)** - Place search in the match venue field and the starting-point field (Settings): it receives the text you type. When a saved venue has a map pin but no address, the app also sends that pin's coordinates to Photon in the background to fill in the address. Photon never receives player data, account details or your device's location; like any web service, it sees your device's IP address (EU, Germany). [Komoot Privacy Policy](https://www.komoot.com/privacy)

**OpenAI, or the AI provider you connect** - Only if you connect your own account: the voice notes and text you choose to send go to that provider under your own key. We hold no key and see no content (see Voice notes and AI). [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)

**palloliitto.fi (Football Association of Finland)** - The rulebook PDF is fetched from their site when you open a law; they see the request as they would any website visit (IP address), nothing else. [Palloliitto Privacy Notice](https://www.palloliitto.fi/tietosuoja)

## Marketing Emails

Only if you opt in, we send occasional emails about new features and tips to your account email. The legal basis is your consent (Art. 6(1)(a)). You can withdraw it at any time in Settings → Account → Email Preferences; each grant and withdrawal is recorded (see Consent Records). The emails are sent through Resend. Without your consent we send only the account emails the service needs (sign-up confirmation, password reset).

## Voice Notes and Optional AI

MatchOps can record short voice notes during a game. This is how they are handled:

- Recordings are stored only on your device. They are never uploaded to MatchOps servers, never synced between devices, and never included in backups or exports.
- A recording is deleted from your device as soon as you turn it into a note or discard it, and in any case after 30 days.
- The written notes you save become part of the game record and are handled like all other game data described above (stored on your device and, in cloud mode, synced to your account).
- MatchOps never receives your recordings. Notes and report text you choose to save are game data and are handled as described above.

### Optional AI provider (your own account)

You may connect your own account with an AI provider (for example OpenAI) to transcribe recordings, draft or tidy match reports, translate a report, and read back your own notes about one player as prose. If you do:

- Data is sent directly from your device to the provider you chose, under your own account and your own API key. MatchOps is not a party to that processing and has no access to it.
- Nothing is sent automatically. Data leaves your device only when you press a button that says so (Transcribe, Draft, Tidy, Translate, Group these notes), and the app tells you what it is about to send first.
- The provider processes and retains data under its own terms, which you accepted when you created the account. MatchOps has no control over that retention.
- Before drafting requests, player names are replaced with codes on your device (on by default). Transcription requests necessarily contain the words you spoke.
- You can disconnect the provider and delete all recordings at any time from Settings. The key is stored only on your device.

## Your Rights (GDPR)

Under GDPR and applicable data protection laws, you have the right to:

- **Access (Art. 15): export all your data at any time in Settings → Data → Backup & Export - your games, players, staff, settings, your account email and your consent records**
- **Rectification (Art. 16): correct your data directly in the app**
- **Erasure (Art. 17): delete the data on your device, your cloud data or your whole account at any time in Settings → Data**
- **Portability (Art. 20): the export is a standard JSON file you can take elsewhere**
- **Restriction (Art. 18): ask us to limit how we process your data by emailing support@match-ops.com**
- **Objection (Art. 21): turn off Settings → Data → Error reporting and usage statistics - error reports and onboarding milestones then stop for your account. For any other objection, email support@match-ops.com**
- **Withdraw consent (Art. 7(3)): withdraw marketing consent in Settings → Account → Email Preferences, and disconnect an AI provider in Settings at any time**

Data on this device: Settings → Data

Cloud data and your account: Settings → Data

Most rights can be used directly in the app under Settings → Data. For anything else, email support@match-ops.com.

If you believe your data protection rights have been violated, you have the right to lodge a complaint with a supervisory authority. In Finland: Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto): [tietosuoja.fi](https://tietosuoja.fi/en/home)

## Children's Privacy

MatchOps is a tool for adult coaches, not for children. Players do not use the app: the coach enters player names, statistics and notes. That data is stored on the coach's device and in the coach's cloud account in the EU only to provide the service, and we never send it to third parties other than our sub-processors listed above - except when the coach connects their own AI provider and chooses to send notes or recordings to it (see Voice Notes and Optional AI). Venue search text and saved venue pin coordinates can go to Photon for place search and address lookup; no player data does. The coach, or the club the coach acts for, is the controller of the player data and is responsible for informing players' families; Settings → Data has a ready-made notice for that.

## Data Security

On your device, your data is stored in the browser's IndexedDB database:

- Protected by your device's access controls (screen lock, password, biometrics)
- Not additionally encrypted at rest beyond what your device/browser provides
- The on-device copy is only transmitted when syncing to your private cloud account, over an encrypted connection

Your device's security is your primary protection for local data. We recommend using a strong screen lock.

In your cloud account, your data is protected by:

- Encrypted in transit (HTTPS/TLS)
- Encryption at rest on Supabase servers in the EU (Stockholm, Sweden)
- Row-level security ensuring you can only access your own data
- Backed by Supabase's security infrastructure and SOC 2 compliance

### Backup File Security

When you export your data, the file contains all of it, including staff contact details, your account email and your consent records. Export files are not encrypted, so store them somewhere safe and delete copies you no longer need.

## Changes to This Policy

We may update this policy when necessary. Material changes will update the "Last Updated" date and Policy Version, trigger a re-consent prompt for cloud mode users on their next sign-in, and be available for review before acceptance.

## Contact

Most data requests can be handled directly in the app (Settings → Data). For anything else, email us:

Email: [support@match-ops.com](mailto:support@match-ops.com)

---

*This privacy policy applies to the MatchOps application available on Google Play Store.*
