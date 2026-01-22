# Subscription Implementation Plan

This document outlines the future subscription system for MatchOps cloud sync feature. **This is a planning document for future work** — the actual implementation will come in a later phase.

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
