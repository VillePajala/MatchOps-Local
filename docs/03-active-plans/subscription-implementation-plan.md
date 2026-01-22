# Subscription Implementation Plan

This document outlines the future subscription system for MatchOps cloud sync feature. **This is a planning document for future work** — the actual implementation will come in a later phase.

---

## GitHub Issues

The following issues track the implementation of this plan:

| Issue | Title | Priority |
|-------|-------|----------|
| [#291](https://github.com/VillePajala/MatchOps-Local/issues/291) | Integrate Google Play Billing for subscriptions | High |
| [#292](https://github.com/VillePajala/MatchOps-Local/issues/292) | Implement subscription state management | High |
| [#293](https://github.com/VillePajala/MatchOps-Local/issues/293) | Implement grace period and expiration handling | Medium |
| [#294](https://github.com/VillePajala/MatchOps-Local/issues/294) | Update Terms of Service and Privacy Policy | High |
| [#295](https://github.com/VillePajala/MatchOps-Local/issues/295) | Implement consent collection during sign-up | High |
| [#296](https://github.com/VillePajala/MatchOps-Local/issues/296) | GDPR: Implement 'Delete All My Data' feature | High |
| [#297](https://github.com/VillePajala/MatchOps-Local/issues/297) | GDPR: Implement 'Export All Data' feature | Medium |
| [#298](https://github.com/VillePajala/MatchOps-Local/issues/298) | Implement reverse migration (cloud to local) | Medium |
| [#299](https://github.com/VillePajala/MatchOps-Local/issues/299) | Limit cloud sync to Play Store installs | Medium |
| [#300](https://github.com/VillePajala/MatchOps-Local/issues/300) | Server-side subscription verification | High |
| [#301](https://github.com/VillePajala/MatchOps-Local/issues/301) | Cross-device subscription sync | Medium |

---

## Current State (As of January 2026)

- Local mode is **completely free and unlimited**
- Cloud mode requires **premium** (currently mock purchase)
- Actual payment integration (Play Billing) is not yet implemented
- `PREMIUM_ENFORCEMENT_ENABLED` flag controls mock vs production behavior

---

## 1. Payment Model

### Subscription Tiers

**Single Tier: MatchOps Premium**
- Monthly: TBD (suggested ~$2.99/month)
- Yearly: TBD (suggested ~$24.99/year, ~2 months free)

### What Premium Includes

1. **Cloud Sync**
   - Automatic backup to Supabase cloud
   - Access data from any device
   - Secure authentication

2. **Local Mode Stays Free**
   - Unlimited teams, players, seasons, games
   - Full offline functionality
   - No payment required

### Trial Period

**Recommendation: No trial period**

Rationale:
- Local mode is fully functional and free
- Users can evaluate the app completely before deciding on cloud
- Simplifies subscription management

Alternative if trial is desired:
- 7-day trial with full cloud features
- Requires valid payment method upfront
- Auto-converts to paid subscription

---

## 2. Subscription States

| State | Description | User Experience |
|-------|-------------|-----------------|
| `none` | No subscription, never purchased | Can use local mode only |
| `active` | Paid and valid | Full cloud access |
| `trial` | In trial period (if implemented) | Full cloud access |
| `cancelled` | User cancelled, but still in paid period | Full cloud access until period ends |
| `grace` | Subscription expired, in grace period | Limited cloud access (read-only?) |
| `expired` | Grace period ended | Cloud access disabled, must renew |

### State Machine

```
none -> active (purchase)
none -> trial (start trial, if implemented)

trial -> active (purchase/auto-convert)
trial -> expired (trial ended without purchase)

active -> cancelled (user cancels)
active -> grace (payment failed)

cancelled -> active (resubscribe)
cancelled -> grace (period ended, payment failed)

grace -> active (payment successful)
grace -> expired (grace period ended)

expired -> active (resubscribe)
```

---

## 3. Expiration Handling

### Grace Period

**Duration: 7 days**

Purpose: Handle temporary payment failures (card expired, insufficient funds)

**During Grace Period:**
- Full cloud access continues
- Show warning banner: "Your subscription has expired. Please update payment to continue."
- Send email reminders: Day 1, Day 4, Day 6
- Allow immediate renewal

**After Grace Period:**
- Cloud access disabled
- Data remains in cloud (not deleted)
- Can still access local mode
- Show modal prompting renewal or migration back to local

### Data Retention

**Cloud data retained for: 90 days after expiration**

After 90 days:
- User notified via email before deletion
- Data permanently deleted from Supabase
- User must start fresh if they resubscribe

---

## 4. User Flows

### 4.1 Subscribe (Enable Cloud Sync)

```
User in local mode
    → Click "Enable Cloud Sync"
    → Show upgrade modal
    → User clicks "Upgrade"
    → Launch Play Billing flow
    → Payment successful
        → Grant premium
        → Enable cloud mode
        → Reload app
        → Show login screen
    → Payment cancelled/failed
        → Stay in local mode
        → Show appropriate message
```

### 4.2 Renew (Subscription About to Expire)

```
Subscription ending in < 7 days
    → Show banner: "Your subscription renews on [date]"
    → Auto-renew handled by Google Play

Payment fails
    → Enter grace period
    → Show warning banner
    → User updates payment in Google Play
    → Subscription resumes
```

### 4.3 Cancel (User Initiated)

```
User clicks "Manage Subscription"
    → Open Google Play subscription management
    → User cancels in Google Play
    → Subscription continues until period ends
    → App shows: "Cancelled - Active until [date]"

Period ends
    → Enter grace period (if payment retries)
    → Or directly to expired state
    → Prompt: "Your cloud subscription has ended. Switch to local mode or renew."
```

### 4.4 Expired (Subscription Ended)

```
Subscription expired (grace ended)
    → Show modal: "Cloud subscription expired"
    → Options:
        1. "Renew Subscription" → Launch Play Billing
        2. "Download Data & Switch to Local" → Reverse migration
        3. "Keep Cloud Data" → Stay in cloud mode, read-only?

If user chooses local:
    → Run reverse migration
    → Download all cloud data to local
    → Switch to local mode
    → App works normally in local mode
```

### 4.5 Migrate Back to Local

```
User in cloud mode (active or expired)
    → Settings > "Switch to Local Mode"
    → Show reverse migration wizard
    → Download cloud data to local
    → Confirm switch
    → Disable cloud mode
    → Reload app
    → Now in local mode with data
```

---

## 5. Data Handling

### Cloud Data Retention Policy

| Scenario | Data Retention |
|----------|---------------|
| Active subscription | Indefinite |
| Cancelled (within paid period) | Until period ends |
| Grace period | Full retention |
| Expired | 90 days |
| User-requested deletion | Immediate |

### Reverse Migration

When switching from cloud to local:

1. **Data Download**
   - Download all user data from Supabase
   - Store in local IndexedDB
   - Verify data integrity

2. **Data Conflicts**
   - If local data exists, offer merge options
   - Use same MigrationWizard patterns

3. **Post-Migration**
   - Clear cloud account flag
   - Set mode to local
   - Optionally delete cloud data

### Data Export Before Cancellation

**Best Practice: Prompt user to export before subscription ends**

```
Subscription ending in 3 days
    → Show modal: "Export your data before subscription ends"
    → "Export to File" → Standard backup export
    → "Continue" → Dismiss, trust cloud retention
```

---

## 6. UI/UX Components Needed

### 6.1 Subscription Status Indicator

**Location:** Settings modal

```
┌──────────────────────────────────┐
│ Subscription: Premium            │
│ Status: Active                   │
│ Renews: March 15, 2026          │
│ [Manage Subscription]            │
└──────────────────────────────────┘
```

### 6.2 Renewal Prompt Modal

**Shown:** 7 days before expiration

```
┌──────────────────────────────────┐
│ 🔔 Subscription Renewing Soon    │
│                                  │
│ Your Premium subscription will   │
│ renew on March 15 for $2.99.    │
│                                  │
│ [Manage Subscription]   [OK]     │
└──────────────────────────────────┘
```

### 6.3 Expiration Warning Banner

**Shown:** During grace period

```
┌──────────────────────────────────────────────┐
│ ⚠️ Subscription expired. Renew to continue  │
│    using cloud sync. [Renew Now]             │
└──────────────────────────────────────────────┘
```

### 6.4 Cancellation Confirmation Flow

**Shown:** When user tries to switch to local after cancellation

```
┌──────────────────────────────────┐
│ Switch to Local Mode?            │
│                                  │
│ Your cloud data will be kept    │
│ for 90 days. You can:           │
│                                  │
│ • Download data to this device  │
│ • Export a backup file          │
│ • Leave data in cloud           │
│                                  │
│ [Download & Switch]  [Cancel]   │
└──────────────────────────────────┘
```

### 6.5 Manage Subscription Link

**Behavior:** Opens Google Play subscription management

```typescript
const openSubscriptionManagement = () => {
  // Deep link to Google Play subscription management
  const url = 'https://play.google.com/store/account/subscriptions';
  window.open(url, '_blank');
};
```

---

## 7. Technical Implementation

### 7.1 Play Billing Integration

**Library:** `@anthropic/play-billing` or similar wrapper

**Required Capabilities:**
- Query subscription status
- Launch purchase flow
- Listen for subscription updates
- Verify purchase tokens

**Server-Side Verification:**
- Supabase Edge Function to verify tokens
- Google Play Developer API integration
- Store subscription status in user profile

### 7.2 Server-Side Subscription Verification

**On Every Cloud Operation:**
1. Check subscription status from Supabase
2. If expired/grace, handle appropriately
3. Verify with Google Play periodically (not every request)

**Supabase Schema Addition:**
```sql
-- Add to users or create subscription table
CREATE TABLE subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'none',
  google_purchase_token TEXT,
  period_end TIMESTAMPTZ,
  grace_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.3 License Validation on App Start

```typescript
// On app start in cloud mode
async function validateSubscription(): Promise<SubscriptionStatus> {
  // 1. Check local cache first (for offline support)
  const cached = getCachedSubscriptionStatus();
  if (cached && !isExpired(cached.checkedAt, CACHE_DURATION)) {
    return cached.status;
  }

  // 2. If online, verify with server
  if (navigator.onLine) {
    const status = await fetchSubscriptionStatus();
    cacheSubscriptionStatus(status);
    return status;
  }

  // 3. Offline: use cached status with grace
  if (cached) {
    return cached.status;
  }

  // 4. No cache, offline: assume expired (safe default)
  return 'expired';
}
```

### 7.4 Offline Grace Handling

**Challenge:** User may be offline when subscription expires

**Solution:**
- Cache subscription status with expiry buffer
- Allow offline access for 7 days past known expiry
- On reconnect, verify and update status
- Never delete local data due to subscription status

---

## 8. Questions to Decide Later

### Pricing
- [ ] Exact monthly price
- [ ] Exact yearly price
- [ ] Launch promotion (first month free?)

### Trial
- [ ] Offer trial period?
- [ ] Trial duration
- [ ] Require payment method for trial?

### Grace Period
- [ ] Grace period duration (7 days suggested)
- [ ] Read-only or full access during grace?

### Data Retention
- [ ] How long to keep data after expiration (90 days suggested)
- [ ] Send deletion warning emails?
- [ ] Allow data recovery after deletion?

### Regional Pricing
- [ ] Different prices for different regions?
- [ ] Which regions to support initially?

### Family/Team Plans
- [ ] Offer family sharing?
- [ ] Offer team plans for coaching organizations?

---

## 9. Legal & Compliance Requirements

### 9.1 Terms of Service & Privacy Policy

**Required before launch:**
1. Update `/terms` page with subscription terms
2. Update `/privacy-policy` with cloud data handling
3. Add data processing agreement details
4. Document subscription cancellation rights

### 9.2 Consent Collection

**During Account Creation:**
- [ ] Terms of Service acceptance checkbox (required)
- [ ] Privacy Policy acceptance checkbox (required)
- [ ] Marketing email consent checkbox (optional, opt-in)

**Implementation:**
```typescript
// During sign-up flow
interface ConsentData {
  termsAccepted: boolean;        // Required
  privacyAccepted: boolean;      // Required
  marketingConsent: boolean;     // Optional, default false
  consentTimestamp: string;      // ISO timestamp
  consentVersion: string;        // Version of T&C accepted
}
```

**Storage:**
- Store consent in Supabase `user_consents` table
- Keep audit log of consent changes
- Allow users to update marketing preferences in Settings

### 9.3 GDPR Compliance

**Required Features:**

1. **Right to Access (Article 15)**
   - Users can request all their data
   - "Export All Data" button in Settings
   - Provide data in machine-readable format (JSON)

2. **Right to Erasure (Article 17)**
   - "Delete All My Data" option in Settings
   - Must delete ALL user data from Supabase
   - Must delete auth account
   - Confirm action with modal warning
   - Email confirmation of deletion

3. **Right to Data Portability (Article 20)**
   - Export data in standard format
   - Already implemented via backup export

4. **Data Processing Records**
   - Document what data is collected
   - Document processing purposes
   - Document retention periods

**Delete Account Flow:**
```
User clicks "Delete Account"
    → Show warning modal with consequences
    → Require password/confirmation
    → Delete all data from:
        - games, game_events, game_players, game_assessments, etc.
        - players, teams, seasons, tournaments, personnel
        - user profile and settings
        - auth.users entry
    → Sign out user
    → Show confirmation
    → Redirect to welcome screen
```

### 9.4 Cookie/Tracking Consent

**Current State:**
- No third-party cookies used
- Only essential cookies (session, preferences)
- Sentry error tracking (opt-out available)

**If adding analytics:**
- Must add cookie consent banner
- Must respect "Do Not Track" browser setting
- Document in Privacy Policy

---

## 10. Desktop & Web Payment Considerations

### Challenge

Google Play Billing only works in **Android TWA/PWA installed from Play Store**. Users accessing the app via:
- Desktop browser (Windows, Mac, Linux)
- iOS Safari
- Android browser (not installed)

**Cannot use Play Billing** for these platforms.

### Options

#### Option A: Desktop-Only Mode (Recommended for MVP)

Desktop users can only use **local mode**. Cloud sync requires Play Store installation.

**Implementation:**
- Detect platform on welcome screen
- If not Android/TWA, hide "Sign in to cloud" option
- Show message: "Cloud sync available on Android app"
- Provide Play Store download link

**Pros:**
- Simplest implementation
- Avoids payment complexity
- Play Store handles all billing

**Cons:**
- Limits cloud feature to mobile users
- May frustrate desktop users

#### Option B: Web Payments (Stripe Integration)

Add alternative payment method for non-Play Store users using Stripe.

**Challenges:**
- Different billing system to maintain
- Google may require Play Billing for Android
- Must handle dual subscription status
- More complex subscription management

**Implementation Cost:** High

#### Option C: PWA Detection

Only show cloud option when installed as PWA from Play Store.

**Detection:**
```typescript
const isInstalledPWA = () => {
  // Check if running in standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // Check if document referrer is Play Store
  const fromPlayStore = document.referrer.includes('play.google.com');
  // Check for TWA origin trial token
  const isTWA = 'getDigitalGoodsService' in window;

  return isStandalone && (fromPlayStore || isTWA);
};
```

**Pros:**
- Ensures Play Billing is available
- No web payment complexity

**Cons:**
- Excludes desktop PWA users
- May not detect all Play Store installs

#### Option D: Hybrid Approach (Future)

1. **MVP:** Desktop = local mode only
2. **Phase 2:** Add Stripe for web users
3. **Phase 3:** Unify subscription across platforms

### Recommendation for MVP

**Go with Option A: Desktop-Only Mode**

Rationale:
- Primary user base is coaches on mobile
- Desktop is secondary use case
- Simplifies billing implementation
- Can add web payments later if demand exists

**Implementation Tasks:**
- [ ] Add platform detection utility
- [ ] Conditionally show cloud option on WelcomeScreen
- [ ] Add "Get Android App" prompt for desktop users
- [ ] Document platform limitations

---

## Implementation Phases

### Phase 1: Basic Subscription (MVP)
- Play Billing integration
- Simple active/expired states
- Basic renewal flow

### Phase 2: Grace Period & Warnings
- Grace period handling
- Warning banners and modals
- Email notifications

### Phase 3: Advanced Features
- Subscription management in-app
- Promotional pricing
- Analytics and metrics

---

## References

- [Google Play Billing Overview](https://developer.android.com/google/play/billing)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [MatchOps Implementation Guide](./supabase-implementation-guide.md)
