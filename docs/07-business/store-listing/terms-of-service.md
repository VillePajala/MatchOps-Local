# Terms of Service for MatchOps

**Last Updated**: November 2026
**Terms Version**: 2026-11

> **Hosted URL**: https://match-ops.com/terms (use this URL for Play Store submission) - redirects to `https://www.match-ops.com/terms`, verified live 2026-11-20.
>
> **Canonical source**: the live text is in the locale files (`public/locales/{en,fi}/common.json` and `site/public/locales/...` → `termsOfService.*`), rendered at `/terms`. This file is an English snapshot of the app text, regenerated 2026-11-20 for version 2026-11; if it differs from the locale files, the locale files win.

## Agreement to Terms

By downloading, installing, or using MatchOps ("the app"), you agree to these Terms of Service. If you do not agree, do not use the app.

## Description of Service

MatchOps is a soccer coaching application with cloud sync that helps coaches:

- Track game time and scores
- Manage player rosters
- Record player statistics
- Organize leagues and tournaments

Your data is stored in your private cloud account and cached on your device for offline use.

## License Grant

We grant you a limited, non-exclusive, non-transferable, revocable license to use MatchOps for personal, non-commercial purposes in accordance with these terms.

You may NOT:

- Reverse engineer, decompile, or disassemble the app
- Modify, adapt, or create derivative works
- Distribute, sublicense, or transfer the app to others
- Use the app for any illegal purpose
- Remove any copyright or proprietary notices

## User Responsibilities

You are responsible for:

- All data you enter into the app
- Maintaining backups of your data (using the export feature)
- Ensuring your use complies with applicable laws
- Any activity that occurs through your use of the app

## Data and Privacy

Your data is stored in your private cloud account and cached on your device for offline use. See our Privacy Policy for details on data handling, security, GDPR rights, and what limited data we may collect. [Privacy Policy](/privacy-policy)

### Data Security Acknowledgment

By using MatchOps, you acknowledge that:

- On-device cache: data cached on your device is stored in the browser's IndexedDB without additional encryption beyond what your device provides
- Device security: Your device's access controls (screen lock, password, biometrics) are your primary protection for local data
- Backup files: Exported backup files contain unencrypted data and should be stored securely
- Personnel data: If you store personnel contact information (email, phone), it follows the same security model as other app data
- Your responsibility: You are responsible for protecting access to your device and backup files

Your data is protected with server-side encryption, encryption at rest, and row-level security.

## Data Processing (GDPR Art. 28)

This section is the data processing agreement between you and us under GDPR Art. 28(3). It is based on the standard contractual clauses between controllers and processors adopted by the European Commission in Implementing Decision (EU) 2021/915, and it applies whenever you enter personal data about other people (players and staff).

- Roles: you - or the club you act for - are the controller of that data. MatchOps (Ville Pajala) is your processor.
- Subject, nature and duration: storing, syncing and showing the data you enter (such as names, shirt numbers, positions, match events, statistics, notes and staff contact details) about the players and staff of your teams, for as long as your account exists.
- Instructions: we process the data only to provide the service, on your documented instructions - these Terms and the actions you take in the app - unless EU or Finnish law requires otherwise; in that case we tell you first, unless the law forbids it.
- Confidentiality: everyone authorised to process the data on our behalf is bound by confidentiality. We do not look at your content except when you ask us to or the law requires it.
- Security (Art. 32): the data is hosted in the EU (Stockholm, Sweden), encrypted in transit (HTTPS/TLS) and at rest, and separated per account by row-level security. If a personal data breach affects your data, we notify you without undue delay.
- Sub-processors: you give general authorisation for Supabase (database and authentication, EU), Sentry (error reporting), Resend (account emails) and Vercel (hosting). We bind them by contract to the same data protection obligations. We tell you about any intended addition or replacement in advance by updating this list and the Privacy Policy, so you can object; if you object, you can stop using the service and delete your account.
- Assistance: the app lets you access, correct, export and delete the data yourself, which is how we help you answer requests from the people concerned. As far as the nature of the processing allows, we also help you with security, breach notification and impact assessments.
- End of the service: when you delete your account, we delete the data (see the Privacy Policy for backups). You can export it at any time before that.
- Demonstrating compliance: on request to support@match-ops.com, we make available the information needed to demonstrate that these obligations are met, and allow and contribute to reasonable audits.

## Player Data: Your Responsibilities

Informing players and their families about the data you keep (GDPR Art. 13-14) is your duty, or your club's. Settings → Data has a ready-made notice you can copy and send.

Do not enter health data or other special categories of personal data (GDPR Art. 9) - for example injuries, illnesses, diagnoses, religion or ethnic origin - in notes, match reports or any other field. A first name or nickname is enough to identify a player.

## Intellectual Property

MatchOps and all related trademarks, logos, and content are the property of the developer (Ville Pajala). You do not acquire any ownership rights by using the app.

## Disclaimer of Warranties

The app is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to:

- Merchantability
- Fitness for a particular purpose
- Non-infringement
- Accuracy or reliability of data

We do not warrant that the app will meet your specific requirements, be uninterrupted, timely, secure, or error-free, or that any errors will be corrected.

## Limitation of Liability

To the maximum extent permitted by law, in no event shall the developer be liable for any indirect, incidental, special, consequential, or punitive damages, loss of data, profits, or business opportunities.

Our total liability shall not exceed the amount you paid for the app (if any).

## Data Loss

You acknowledge that:

- Your data is stored in your cloud account and cached on your device for offline use
- We are not responsible for data loss due to device failure, app uninstallation, or any other cause
- You should regularly export and backup important data

## No Professional Advice; Use at Your Own Risk

MatchOps is a coaching tool that records and displays information you provide. It does not give professional, medical, legal, or safety advice. All decisions you make using the app — including those affecting players' health, safety, or playing time — are your own, and you use the app at your own risk.

## Indemnification

To the maximum extent permitted by applicable law (including mandatory consumer-protection law), you agree to indemnify, defend, and hold harmless the developer (Ville Pajala) from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to: (a) the data and content you enter into the app; (b) your violation of these terms or any applicable law; or (c) your storage or handling of other people's personal data, such as players and personnel. For any personal data you enter about third parties, you act as the data controller and are solely responsible for having a lawful basis and any required consents.

## Third-Party Services

The app may interact with third-party services:

- **Google Play Store** - For app distribution and payments
- **Sentry** - For automatic error reporting in production
- **Supabase** - For cloud sync and authentication (cloud mode)
- **Vercel** - For PWA web hosting
- **Resend** - For account emails (sign-up confirmation, password reset) and, if you opt in, marketing emails
- **Photon (Komoot)** - For place search in the match venue and starting-point fields; it receives the text you type there
- **OpenAI, or another AI provider you connect** - For voice-note transcription and match report drafts, only through your own account and API key, and only if you connect one
- **palloliitto.fi** - The rulebook is fetched from the Football Association of Finland's own site when you open a law

Your use of these services is governed by their respective terms and policies.

## Optional AI Services

MatchOps lets you connect your own account with a third-party AI provider to transcribe voice notes and draft reports. Any such use is governed by your agreement with that provider. MatchOps is not a party to it, does not receive the data, and is not responsible for the provider's processing, availability, output or fees.

You are responsible for the content you record or dictate and for having the right to process it. Do not record health information or other special categories of personal data (see Player Data: Your Responsibilities).

AI output is a draft. You review and accept every item before it is saved, and you remain responsible for what you keep.

## Paid Features

We may introduce paid subscription plans in the future. If offered, paid features may include:

- Cloud Sync: Access your data across multiple devices
- Unlimited players, teams, leagues, and tournaments
- Priority support

If paid subscriptions are introduced, they will be billed through Google Play Store. See Google Play's terms for billing, cancellation, and refund policies.

If you have an active subscription, you can cancel at any time through Google Play. After cancellation, you retain access until the end of your billing period.

If a paid subscription is cancelled, your cloud data remains accessible. You can export or delete it at any time. We reserve the right to remove cloud data after an extended period of account inactivity, with prior notice.

## Cloud Sync Terms

When you use cloud sync:

- You retain ownership of all your data
- We strive for high availability but do not guarantee uninterrupted access
- You are responsible for maintaining local backups of critical data
- We implement industry-standard security measures to protect your data

You can delete all cloud data at any time from Settings. Deletion is permanent and cannot be undone.

## Changes to the App

We reserve the right to modify or discontinue the app at any time and add or remove features.

## Changes to Terms

We may update these terms when necessary. Material changes will update the "Last Updated" date and trigger a re-consent prompt for cloud mode users. Continued use of the app after changes constitutes acceptance of the new terms.

## Termination

We may terminate or suspend your access to the app immediately, without notice, if you breach these terms. Upon termination, your license to use the app ends.

If your account is terminated, you will lose access to Cloud Sync features. Your local data will remain on your device. Cloud data will be deleted within a reasonable period after termination.

You can voluntarily delete your cloud account and data at any time from the Settings menu.

## Governing Law and Dispute Resolution

These terms are governed by the laws of Finland, without regard to conflict of law principles. Any disputes arising from these terms or your use of the app shall be resolved in the courts of Helsinki, Finland.

## Severability

If any provision of these terms is found unenforceable, the remaining provisions will continue in effect.

## Entire Agreement

These terms, together with our Privacy Policy, constitute the entire agreement between you and us regarding the app.

## Contact

Most actions (data export, deletion, account management) can be done directly in the app under Settings. For questions about these terms:

Email: [support@match-ops.com](mailto:support@match-ops.com)

---

*These Terms of Service apply to the MatchOps application available on Google Play Store.*
