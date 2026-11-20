# Play Store Listing Assets

Google Play Store listing reference. MatchOps is live on Google Play (released 2026-06-09; current version 1.0.9, versionCode 20, live 2026-11-20, with the new badge icon). The Play build is cloud-only: users must sign in.

## Required Assets

### App Icons
- [x] 512x512 PNG (high-res icon) - `public/icons/play-store-icon-512.png` (generated; see twa-build-guide.md "Icon source of truth")

### Feature Graphic
- [x] 1024x500 PNG - an early version is in `public/screenshots/play-store/feature-graphic.png` (2025-12); the one live in the Play Console may be newer

### Screenshots (Phone)
Required: 2-8 screenshots
- Dimensions: 16:9 or 9:16 aspect ratio
- Min: 320px, Max: 3840px per side
- Recommended captures:
  1. Main game screen with soccer field
  2. Player roster management
  3. Game settings/lineup configuration
  4. Statistics view
  5. Timer in action during game

### Screenshots (Tablet - Optional)
- 7-inch tablet: 2-8 screenshots
- 10-inch tablet: 2-8 screenshots

## Store Listing Text

The current listing texts are [`docs/04-features/store-listing-en.txt`](../../04-features/store-listing-en.txt) and [`docs/04-features/store-listing-fi.txt`](../../04-features/store-listing-fi.txt). The old English description that used to live here is archived at [`docs/08-archived/store-description-en.md`](../../08-archived/store-description-en.md).

## Content Rating

**App Category**: Sports → Soccer/Football Tools

**Content Rating Questionnaire**:
- Violence: None
- Sexual Content: None
- Language: None
- Controlled Substances: None
- User-Generated Content: No (coach's own data in a private account; nothing is shared between users)
- Location Sharing: No
- Ads: No

Expected Rating: **Everyone (E)**

## Privacy & Policies

### Privacy Policy URL
**Required**: Must be hosted publicly

Live at https://match-ops.com/privacy-policy (redirects to the site's `/privacy`). Version 2026-11. Snapshot: [privacy-policy.md](./privacy-policy.md).

### Terms of Service URL
Live at https://match-ops.com/terms. Version 2026-11. Snapshot: [terms-of-service.md](./terms-of-service.md).

### Data Safety form (Play Console, owner-only) - answers as of 2026-11-20

Checked against the code and the 2026-11 policy. The Play build is cloud-only
(sign-in required); local mode is not in the Play build.

**Data collection and security**
- Collects or shares required data types: yes. Encrypted in transit: yes (HTTPS).
- Deletion: yes. Account: Settings → Data → Delete account (`delete-account`
  edge function; consent records go with it, migration 063). Data only:
  Settings → Data → Danger Zone → Delete All Data (`clear_all_user_data`; keeps
  the account, consent records and sync deletion markers). Deletion URL:
  https://www.match-ops.com/delete-account (English: /en/delete-account).
- Independent security review: no.

**Data types** (processors Supabase, Sentry, Resend, Vercel are not "sharing")

| Type | Collected / shared | Required | Purposes |
|---|---|---|---|
| Personal info → Email address | collected | required | App functionality, Account management, Developer communications (marketing opt-in) |
| Personal info → Name (players, staff, coach-entered) | collected | required | App functionality |
| Personal info → User IDs (account UUID) | collected | required | App functionality, Account management |
| Personal info → Phone number (staff, optional field) | collected | optional | App functionality |
| App activity → Other user-generated content (games, line-ups, events, notes, transcripts, venues, pins, starting point) | collected **and shared** (Photon: typed venue text and pin coordinates) | required | App functionality |
| App activity → App interactions (onboarding milestones, page paths in Sentry traces) | collected | optional (diagnostics switch) | Analytics |
| App info and performance → Crash logs | collected | optional (switch) | Analytics |
| App info and performance → Diagnostics (traces, masked replay on error) | collected | optional (switch) | Analytics |
| Audio → Voice recordings (only when sent to the coach's own AI provider) | collected, not shared | optional | App functionality |

**Not ticked:** Location (venue pins are places the coach chooses; the app never
reads device location, `geolocation=()`), photos/videos, contacts, messages,
financial, health (no health field; the app asks not to record health data),
web browsing, calendar, files, device or ad IDs. Sentry gets no user ID/email
and no IP (`sendDefaultPii` off).

**Judgement calls:** Audio declared as collected (cautious; the user-initiated
BYOK transfer would arguably be exempt). Photon declared as shared because the
background address heal sends pin coordinates without a user action. Target
audience stays adults (coaches), although the players are children.

**Policy/code mismatches found 2026-11-20 - all fixed in PR #PRNUM:** (1)
`healVenueAddresses` reverse-geocodes saved pins via Photon in the background -
the policy now says so; (2) server/edge Sentry configs ignored the diagnostics
switch - they now send errors only (`tracesSampleRate: 0`, `sendDefaultPii:
false`, no account data) and the policy says the switch covers the app on the
device; (3) the site's delete-account page said "Settings → Backup" - now
Settings → Data → Backup & Export, and the page has a "delete your data but
keep your account" section; (4) the policy's children's section omitted Photon -
it now names it (venue text and pin coordinates, no player data).

## Pricing & Distribution

### Pricing Model
- **Free.** Monetization is parked: billing code exists but enforcement is off (`PREMIUM_ENFORCEMENT_ENABLED = false`).

### Target Countries
- Initial: Finland, Sweden, Norway, Denmark, UK, USA, Canada
- Expansion: All countries where Play Store available

### Device Compatibility
- Android 7.0+ (API 24+), target Android 16 (API 36) from 1.0.9
- Phones and tablets
- No special hardware requirements

## Checklist

Done - the app passed review and is live (first release 2026-06-09):
- [x] App icon uploaded (512x512)
- [x] Feature graphic created (1024x500)
- [x] At least 2 phone screenshots
- [x] Short description (80 chars)
- [x] Full description (4000 chars)
- [x] Privacy Policy URL live
- [x] Content rating questionnaire completed
- [x] App category selected
- [x] Contact email configured
- [x] Release name set (current: 1.0.9)
