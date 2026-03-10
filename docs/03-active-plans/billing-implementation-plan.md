# Billing Implementation Plan

**Status:** Revised (March 2026 -- model changed from subscription to one-time purchase)
**Last Updated:** March 2026
**Supersedes:** January 2026 subscription-based plan
**Monetization Strategy:** See `docs/07-business/monetization-strategies.md`

---

## Executive Summary

MatchOps uses a **generous freemium model** with a **one-time purchase** to unlock unlimited competitions. Account creation is free. Cloud sync is free. The purchase gates the ability to create more than 3 seasons or 3 tournaments.

### Model Overview

| Resource | Free | Full Version (~4.99 EUR one-time) |
|----------|------|----------------------------------|
| Teams | Unlimited | -- |
| Players | Unlimited | -- |
| Games | Unlimited | -- |
| Seasons | 3 | Unlimited |
| Tournaments | 3 | Unlimited |
| Features | All | -- |
| Cloud Sync | Included | -- |

### Key Principle: No Surprises

Users must know about the free tier limits BEFORE they hit them. Limits are communicated:
1. **Play Store listing** -- app description mentions "3 free competitions"
2. **In-app indicators** -- competition list shows "2 of 3 free seasons used"
3. **Approaching limit** -- gentle reminder when creating competition #3: "This is your last free season"
4. **At limit** -- clear upgrade prompt when creating competition #4
5. **Settings page** -- tier status and usage always visible

The user should NEVER be surprised by the upgrade prompt. By competition #4, they've seen the limit communicated at least 2-3 times.

---

## What's Already Built

### Infrastructure (Reusable)

| Component | File | Status | Changes Needed |
|-----------|------|--------|---------------|
| Premium limits config | `src/config/premiumLimits.ts` | Exists | Update limits to 3 seasons + 3 tournaments only; update product ID to `premium_unlock`; set `PREMIUM_IS_SUBSCRIPTION = false` |
| Premium manager | `src/utils/premiumManager.ts` | Exists (disabled) | Re-enable `canCreateResource`/`getRemainingCount` for seasons + tournaments only |
| Premium context | `src/contexts/PremiumContext.tsx` | Exists (disabled) | Re-enable enforcement logic (currently hard-coded `isPremium: true`) |
| Upgrade prompt modal | `src/components/UpgradePromptModal.tsx` | Exists | Update copy from subscription to one-time purchase |
| Upgrade prompt manager | `src/components/UpgradePromptManager.tsx` | Exists | Already wired via ClientWrapper -- no changes needed |
| Resource limit hook | `src/hooks/usePremium.ts` | Exists | Add "approaching limit" warning (remaining === 1); currently only has hard block |
| Enforcement flag | `src/config/constants.ts` | Exists | `PREMIUM_ENFORCEMENT_ENABLED` -- flip to true in Phase 7 |
| Platform detection | `src/utils/platform.ts` | Exists | `isPlayStoreContext()`, `isDigitalGoodsAvailable()` -- no changes needed |
| Play Billing utils | `src/utils/playBilling.ts` | Exists | Update product ID from `matchops_premium_monthly` to `premium_unlock`; change `purchaseSubscription()` to `purchaseFullVersion()` for one-time flow |
| Play Billing hook | `src/hooks/usePlayBilling.ts` | Exists | Update `purchase()` for one-time flow; update `restore()` to pass purchase type |
| Subscriptions table | `supabase/migrations/010_subscriptions.sql` | Exists | No schema change needed -- use `status = 'active'` with `period_end = NULL` for permanent purchase |
| Subscription RPC | `get_subscription_status()` in `010_subscriptions.sql` | Exists | No change needed -- already returns `is_active = true` for `status = 'active'` regardless of `period_end` |
| Verify Edge Function | `supabase/functions/verify-subscription/` | Exists | Significant update: add `purchaseType` param, branch verification logic, use Google `purchases/products` endpoint for one-time |
| Subscription context | `src/contexts/SubscriptionContext.tsx` | Exists (disabled) | See "SubscriptionContext Decision" below |
| Season/tournament management | `src/components/SeasonTournamentManagementModal.tsx` | Exists | Already has `useResourceLimit` checks on Add buttons (lines 48-49); needs limit visibility indicators |
| i18n keys | `public/locales/{en,fi}/common.json` | Exists | Update limit text (old: "1 season / 1 tournament", new: "3 seasons / 3 tournaments"); remove team/player/game limit text |
| ClientWrapper | `src/components/ClientWrapper.tsx` | Exists | Already wraps PremiumProvider > UpgradePromptManager > children -- no changes needed |

### Infrastructure NOT Needed Anymore

| Component | Old Purpose | Why Not Needed |
|-----------|-------------|---------------|
| Account-gated-to-subscription | Required payment before account creation | Accounts are now free |
| Monthly subscription logic | Recurring billing cycle | One-time purchase, no renewal |
| Grace period handling | Payment failure recovery | No recurring payments |
| Subscription expiry checking | Period end enforcement | Purchase is permanent |

### SubscriptionContext Decision

**Problem:** Two overlapping contexts exist:
- **PremiumContext** -- resource limits (seasons/tournaments)
- **SubscriptionContext** -- cloud sync eligibility

**Old model:** SubscriptionContext gated cloud sync access (subscription required).
**New model:** Cloud sync is free for everyone.

**Decision:** Keep SubscriptionContext but simplify:
- Cloud sync remains free -- `isSubscriptionActive()` always returns `true` (already does this)
- SubscriptionContext fetches `get_subscription_status()` RPC on sign-in -- this is the cross-device premium detection mechanism
- This avoids merging two contexts (risky refactor)

**Cross-device premium detection:**

The bridge between SubscriptionContext and PremiumContext must be a **hook** in a component that renders inside BOTH providers. It cannot live in SubscriptionContext.tsx because SubscriptionProvider is a parent of PremiumProvider in the component tree:

```
layout.tsx: QueryProvider > AuthProvider > SubscriptionProvider > ClientWrapper
ClientWrapper.tsx: ToastProvider > PremiumProvider > UpgradePromptManager > children
```

**Implementation: `usePremiumSubscriptionBridge` hook**

Place in a component inside ClientWrapper (e.g., UpgradePromptManager or a new bridge component):

```typescript
function usePremiumSubscriptionBridge() {
  const { status } = useSubscription();       // from SubscriptionContext
  const { isPremium, grantPremiumAccess } = usePremiumContext();
  const hasGrantedRef = useRef(false);

  useEffect(() => {
    // Bridge: when Supabase says user has an active purchase,
    // grant premium locally (cross-device detection).
    // Check raw status, NOT isActive (which is always true for free cloud sync).
    // status === 'active' means user has a real purchase record in the DB.
    // status === 'none' means no purchase.
    if (status === 'active' && !isPremium && !hasGrantedRef.current) {
      hasGrantedRef.current = true;
      grantPremiumAccess();
    }
  }, [status, isPremium, grantPremiumAccess]);
}
```

**Key detail:** The bridge checks the **raw `status` field** (not `isActive`), because `isActive` is hardcoded to `true` for all users (cloud sync is free). Only a real purchase creates a `subscriptions` row with `status = 'active'`. Users without purchases have no row (status defaults to `'none'` from the RPC).

**Important:** The `cloudUpgrade` variant of `UpgradePromptModal` (used in `page.tsx` lines 935-938 and `CloudSyncSection.tsx`) must be removed -- it contradicts "cloud sync is free." Cloud sync no longer requires any payment.

---

## Import/Restore/Migration Policy

### Problem

Limits are enforced at the UI layer (SeasonTournamentManagementModal). But seasons/tournaments can also be created via:

| Path | File | Method | Currently Checks Limits? |
|------|------|--------|-------------------------|
| UI creation | `SeasonTournamentManagementModal.tsx` | `addSeasonMutation` | Yes (via `useResourceLimit`) |
| Backup import | `src/utils/fullBackup.ts` (lines 636-653) | `dataStore.upsertSeason()` | **No** |
| File import | `src/utils/importHelper.ts` | Delegates to `fullBackup.ts` | **No** |
| Local-to-cloud migration | `src/services/migrationService.ts` | `cloudStore.createSeason()` | **No** |
| Cloud-to-local migration | `src/services/reverseMigrationService.ts` | `localStore.upsertSeason()` | **No** |

### Policy: Allow Import/Migration, Enforce on New Creation

**Principle:** Never punish users for having existing data. Never block data restoration.

**Rules:**
1. **Import/restore always succeeds** -- if a backup has 10 seasons, all 10 are restored regardless of tier
2. **Migration always succeeds** -- moving data between local/cloud is never blocked
3. **Limits apply only to NEW creation** -- after import, if user has 10 seasons and is on free tier, they can't create #11 but keep all 10
4. **Import shows a post-import notice** (not blocker): "You have 10 seasons. Free tier allows creating up to 3 new seasons. Unlock Full Version for unlimited."

### Implementation

**No changes needed in import/migration code.** The enforcement is at the UI layer (SeasonTournamentManagementModal), which already checks `useResourceLimit()` before allowing creation. Import/migration uses `upsert` which bypasses the UI.

**One addition needed:** After import, if imported data exceeds free limits, show an informational notice (not a blocker). This uses the existing `isOverFreeLimit()` function in `premiumManager.ts`.

**Files to change:**
- `src/utils/fullBackup.ts` -- after import completes, check if data exceeds limits and return a flag
- Import result handler (wherever import success is shown) -- show informational notice if flag is set

**Edge case: Archived seasons count:**
- `SeasonTournamentManagementModal` counts only non-archived: `seasons.filter(s => !s.archived).length`
- This is correct -- archiving a season frees up a slot, unarchiving counts against the limit
- Import may bring in archived seasons -- those don't count against limit

---

## Implementation Phases

### Phase 1: Update Limits Configuration, Product IDs, and Remove Old Resource Types

**Goal:** Update all configuration to reflect the new model AND clean up all usages of removed resource types in the same phase.

**IMPORTANT: Narrowing `ResourceType` from 5 types to 2 will break any file that references removed types ('team', 'game', 'player'). All such usages must be updated in this phase to avoid build failures.**

**Files to change:**

1. **`src/config/premiumLimits.ts`** -- limits, product config, and type narrowing:
```typescript
export const FREE_LIMITS = {
  maxSeasons: 3,
  maxTournaments: 3,
} as const;

export type ResourceType = 'season' | 'tournament';

export const PREMIUM_PRODUCT_ID = 'premium_unlock';
export const PREMIUM_PRICE = '4,99 EUR';  // TBD -- final price
export const PREMIUM_PRICE_AMOUNT = 4.99;
export const PREMIUM_IS_SUBSCRIPTION = false;
```
   - Simplify `getLimit()` to seasons and tournaments only
   - Simplify `getResourceName()` to seasons and tournaments only

2. **`src/utils/playBilling.ts`** -- update product ID and rename subscription-oriented names:
   - Rename `SUBSCRIPTION_PRODUCT_ID` -> import `PREMIUM_PRODUCT_ID` from premiumLimits
   - Rename `purchaseSubscription()` -> `purchaseProduct()` (or `purchaseFullVersion()`)
   - Rename `SubscriptionDetails` interface -> `ProductDetails`
   - Rename `getSubscriptionDetails()` -> `getProductDetails()`

3. **`src/hooks/usePlayBilling.ts`** -- update to use renamed functions from playBilling.ts

4. **`supabase/functions/verify-subscription/index.ts`** -- update valid product IDs (line 36):
```typescript
const VALID_PRODUCT_IDS = ['premium_unlock', 'matchops_premium_monthly'];
// Keep old ID for any existing test purchases; add new one-time product
```

5. **Remove `useResourceLimit` for non-limited resources** (CRITICAL -- prevents build break):
   - `src/components/TeamManagerModal.tsx` -- remove `useResourceLimit('team', ...)` call and related premium limit check
   - `src/components/RosterSettingsModal.tsx` -- remove `useResourceLimit('player', ...)` call and related premium limit check
   - `src/components/HomePage/utils/newGameHandlers.ts` -- remove `canCreate('game', ...)` and `showUpgradePrompt('game', ...)` calls (lines 115-139)
   - `src/components/HomePage/hooks/useGameOrchestration.ts` -- remove passing of `canCreate`/`showUpgradePrompt` for games if no longer needed

6. **Remove `cloudUpgrade` variant** (cloud sync is free -- entire flow is dead code):
   - `src/components/UpgradePromptModal.tsx` -- remove `cloudUpgrade` variant and `UpgradePromptVariant` type (only `resourceLimit` remains; consider removing the variant prop entirely)
   - `src/app/page.tsx` -- remove the FULL post-login cloud upgrade flow:
     - `showPostLoginUpgrade` state variable
     - `handlePostLoginUpgradeClose` and `handlePostLoginUpgradeSuccess` callbacks
     - The post-login subscription check effect that triggers the upgrade modal
     - The `UpgradePromptModal` rendering with `variant="cloudUpgrade"`
   - `src/components/CloudSyncSection.tsx` -- remove upgrade prompt for cloud sync
   - `src/components/HomePage/hooks/useGameOrchestration.ts` -- remove `usePremium()` call and `canCreate`/`showUpgradePrompt` destructuring (no longer needed after game limit removal)
   - `src/components/HomePage/utils/newGameHandlers.ts` -- also remove `canCreate`/`showUpgradePrompt` from `StartNewGameDeps` interface

7. **`public/locales/en/common.json`** and **`public/locales/fi/common.json`** -- update i18n:
   - `settings.limitSeasons`: "1 season / 1 tournament" -> "3 seasons / 3 tournaments"
   - Remove `settings.limitTeams`, `settings.limitPlayers`, `settings.limitGames` (no longer limited)
   - Update `premium.benefit.*` and `premium.cloudBenefit.*` keys
   - Update `premium.resource.team/teamPlural`, `premium.resource.player/playerPlural`, `premium.resource.game/gamePlural` -- remove or keep as unused (won't cause build break but should clean up)
   - Add new keys for "approaching limit" reminder and post-import notice
   - Update non-Android upgrade text: "Subscriptions are available..." -> "Purchases are available..."

**Tests to update (MUST be done in this phase to prevent build failures):**
- `src/config/__tests__/premiumLimits.test.ts` (if exists)
- `src/utils/__tests__/premiumManager.test.ts`
- `src/components/__tests__/UpgradePromptModal.test.tsx` -- remove cloudUpgrade variant tests
- `src/components/__tests__/TeamManagerModal.test.tsx` -- remove premium limit mock/assertions
- `src/components/__tests__/RosterSettingsModal.test.tsx` -- remove premium limit mock/assertions
- `src/components/HomePage/utils/__tests__/newGameHandlers.test.ts` -- remove game limit tests (lines ~173-269)
- `src/components/HomePage/hooks/__tests__/useGameOrchestration.*.test.tsx` -- update `showUpgradePrompt` mocks
- `src/contexts/__tests__/PremiumContext.test.tsx` -- update for new resource types
- `src/__tests__/i18n-validation.test.ts` -- update for changed/removed keys
- Any test file mocking `useResourceLimit` must include the new return fields (`isApproaching`, `isAtLimit`) once Phase 3 adds them. In Phase 1, existing shape is fine.

---

### Phase 2: Re-enable Premium Enforcement

**Goal:** Make `premiumManager.ts` and `PremiumContext.tsx` enforce limits (gated by `PREMIUM_ENFORCEMENT_ENABLED`).

**Files to change:**

1. **`src/utils/premiumManager.ts`** -- re-enable enforcement functions:
```typescript
export function canCreateResource(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): boolean {
  if (!PREMIUM_ENFORCEMENT_ENABLED) return true;  // Feature flag bypass
  if (isPremium) return true;
  return currentCount < getLimit(resource);
}

export function getRemainingCount(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): number {
  if (!PREMIUM_ENFORCEMENT_ENABLED) return Infinity;
  if (isPremium) return Infinity;
  return Math.max(0, getLimit(resource) - currentCount);
}

export function isOverFreeLimit(counts: ResourceCounts): boolean {
  if (!PREMIUM_ENFORCEMENT_ENABLED) return false;
  return counts.seasons > FREE_LIMITS.maxSeasons
    || counts.tournaments > FREE_LIMITS.maxTournaments;
}
```

2. **`src/contexts/PremiumContext.tsx`** -- restore mode-based logic:
```typescript
// Replace the hard-coded setIsPremium(true) with:
const mode = getBackendMode();
if (mode === 'local') {
  setIsPremium(true);  // Local mode = always premium
} else {
  // Cloud mode: check actual license from storage
  const license = await getPremiumLicense();
  setIsPremium(license.isPremium);
}
```

3. **`src/utils/premiumManager.ts`** -- update `ResourceCounts` type:
```typescript
export interface ResourceCounts {
  seasons: number;
  tournaments: number;
  // Removed: teams, gamesInSeason, gamesInTournament, players (no longer limited)
}
```

4. **`src/config/constants.ts`** -- keep `PREMIUM_ENFORCEMENT_ENABLED = false` until Phase 7

5. **Cross-device premium bridge:**
   Add `usePremiumSubscriptionBridge` hook (see "SubscriptionContext Decision" section above).

   **File:** New hook in `src/hooks/usePremiumSubscriptionBridge.ts`, called from `src/components/UpgradePromptManager.tsx` (or new bridge component in ClientWrapper)

   **Architecture constraint:** Bridge MUST live inside a component that renders within BOTH SubscriptionProvider (outer) and PremiumProvider (inner). It cannot live in SubscriptionContext.tsx itself.

   **Key logic:** Check raw `status` field from SubscriptionContext (not `isActive` which is always `true`). Only `status === 'active'` means a real purchase exists in the database. Use a ref to prevent redundant grants.

   **Note on token:** The bridge calls `grantPremiumAccess()` without a purchase token (since the token lives server-side). Pass a sentinel value like `'cross-device-grant'` to distinguish bridge-granted premium from direct-purchase premium in the local license record.

**Tests:**
- `canCreateResource` with enforcement enabled: blocks at limit
- `canCreateResource` with enforcement disabled: always allows
- `getRemainingCount` accuracy
- PremiumContext mode-based behavior (local vs cloud)
- Cross-device bridge: subscription active -> premium granted

---

### Phase 3: Limit Visibility (No Surprises UX)

**Goal:** Show users their limit usage so the upgrade prompt is never a surprise.

**3.1: "Approaching Limit" Hook Enhancement**

The existing `useResourceLimit` hook (in `src/hooks/usePremium.ts`) has `canAdd` (boolean) and `remaining` (number) but no concept of "approaching limit." Add:

```typescript
// In useResourceLimit return value:
return {
  canAdd,           // existing: false when at limit
  remaining,        // existing: number of slots left
  isApproaching,    // NEW: true when remaining === 1 (last free slot)
  isAtLimit,        // NEW: true when remaining === 0
  checkAndPrompt,   // existing: shows upgrade prompt if blocked
};
```

**File:** `src/hooks/usePremium.ts`

**3.2: Competition List Indicators**

In `SeasonTournamentManagementModal.tsx`, add usage indicator for free users:

```
Seasons (2 of 3 free)        |  Tournaments (1 of 3 free)
  - Spring 2026 League       |    - Summer Cup 2026
  - Fall 2025 League          |
```

Premium users see no indicator (or "Unlimited").

**Files to change:**
- `src/components/SeasonTournamentManagementModal.tsx` -- add indicator near list header
- Uses existing `useResourceLimit` hook data

**3.3: "Last Free" Reminder**

When creating competition #3 (the last free one), show a subtle inline note in the creation modal:

> "This is your last free season. After this, you can unlock unlimited seasons with MatchOps Full Version."

This is NOT a blocker -- the user can proceed normally. It's informational only.

**Files to change:**
- `src/components/SeasonDetailsModal.tsx` -- show note when `isApproaching` is true
- `src/components/TournamentDetailsModal.tsx` -- same pattern
- Pass `isApproaching` from `SeasonTournamentManagementModal` to the detail modals

**3.4: Settings Page -- Tier Display**

In Settings Account tab, add a "Plan" section:

```
Plan: Free
Seasons: 2 / 3 used
Tournaments: 1 / 3 used
[Unlock Full Version - 4.99 EUR]
```

Premium users see:
```
Plan: Full Version
Seasons: Unlimited
Tournaments: Unlimited
```

**Files to change:**
- `src/components/SettingsModal.tsx` -- add plan section to Account tab (above CloudSyncSection)
- Needs season/tournament counts from React Query + `usePremiumContext()`

**3.5: Post-Import Notice**

After backup import, if imported data exceeds free limits, show informational toast:

> "Your imported data includes X seasons. Free tier allows creating 3 new seasons. All imported data is preserved."

**Files to change:**
- `src/utils/fullBackup.ts` -- return counts in import result
- Import success handler -- check `isOverFreeLimit()` and show toast if true

**Tests:**
- Render tests for limit indicators (free vs premium)
- `isApproaching` logic (remaining === 1)
- Settings tier display for free and premium users
- Post-import notice appears when data exceeds limits
- Post-import notice does NOT appear when under limits

---

### Phase 4: Upgrade Prompt at Limit

**Goal:** Update upgrade prompt copy for one-time purchase model.

**Note:** Game limit removal and `cloudUpgrade` variant removal are done in Phase 1 (required to avoid build breaks from ResourceType narrowing).

**Files to change:**

1. **`src/components/UpgradePromptModal.tsx`** -- update copy for one-time purchase:
   - Title: "Free version limit reached" (keep existing)
   - Body: "You've used all 3 free seasons." (update limit number)
   - Benefits section header: "Full Version includes:" (was "Your subscription includes:")
   - Benefits content: Replace cloud sync benefits (sync, backup, storage) with competition benefits ("Unlimited seasons & tournaments"). Cloud sync is free and should NOT be listed as a premium benefit.
   - Button: "Unlock Full Version - 4.99 EUR" (change from "Upgrade to Premium")
   - Remove ALL subscription-specific language: monthly, per month, /kk, `premium.subscriptionIncludes` key
   - Update non-Android text: "Purchases are available on the Android app" (not "Subscriptions")

2. **`src/components/SeasonTournamentManagementModal.tsx`** -- already has `checkSeasonLimitAndPrompt()` and `checkTournamentLimitAndPrompt()` (lines 124-138). These call `useResourceLimit` which triggers `UpgradePromptModal`. No new wiring needed -- just verify it works with updated limits.

**Flow (already implemented, just needs correct limits):**
1. User clicks "Add Season" in SeasonTournamentManagementModal
2. `checkSeasonLimitAndPrompt()` calls `useResourceLimit('season', activeSeasonCount)`
3. If `canAdd` is false: `showUpgradePrompt('season', activeSeasonCount)` opens UpgradePromptModal
4. If `canAdd` is true: proceed to SeasonDetailsModal

**Platform-specific behavior in UpgradePromptModal (already implemented):**
- **Android TWA**: "Unlock Full Version" triggers Play Billing (Digital Goods API)
- **Vercel preview / internal testing**: Test token flow (mock purchase)
- **Other platforms**: "Available on the Android app" with Play Store link

**Tests:**
- Modal renders with correct one-time purchase copy
- Modal shows when season limit reached (count >= 3)
- Modal shows when tournament limit reached (count >= 3)
- Modal does NOT show when under limit
- Game creation no longer triggers limit checks
- "Not Now" dismisses without side effects
- Purchase flow triggers correctly on Android (existing tests, update expectations)

---

### Phase 5: Play Store Billing Integration (One-Time Purchase)

**Goal:** Update Play Billing code for one-time in-app purchase instead of subscription.

**5.1: Play Store Product Setup**

Create in-app product in Google Play Console:
- Product ID: `premium_unlock`
- Type: **One-time (non-consumable)**
- Price: ~4.99 EUR (localized pricing)
- Title: "MatchOps Full Version"
- Description: "Unlock unlimited seasons and tournaments"

**5.2: Update `src/utils/playBilling.ts`**

Key changes:
- Rename `purchaseSubscription()` to `purchaseFullVersion()` (or make generic)
- Product ID already updated in Phase 1
- Purchase flow: Payment Request API is the same for one-time and subscription in Digital Goods API
- Acknowledgement: Use `'onetime'` type instead of `'subscription'`
- `getExistingPurchases()`: Digital Goods API `listPurchases()` returns both one-time and subscriptions -- verify it includes one-time purchases for restore

```typescript
// Key difference in acknowledge:
// Old: await service.acknowledge(purchaseToken, 'repeatable');
// New: await service.acknowledge(purchaseToken, 'onetime');
```

**5.3: Update `src/hooks/usePlayBilling.ts`**

- Update `purchase()` to call new one-time purchase function
- Update `restore()` to filter for `premium_unlock` product
- Pass `purchaseType: 'onetime'` to `verifyPurchaseWithServer()`
- Remove subscription-specific state (subscription details, renewal info)

**5.4: Restore Purchases**

One-time purchases must be restorable (reinstall, new device):

```typescript
export async function restorePurchases(): Promise<boolean> {
  const service = await window.getDigitalGoodsService(
    'https://play.google.com/billing'
  );
  const purchases = await service.listPurchases();
  const fullVersion = purchases.find(p => p.itemId === PREMIUM_PRODUCT_ID);

  if (fullVersion) {
    // Verify with server, then grant locally
    await verifyPurchaseWithServer(fullVersion.purchaseToken, 'onetime');
    await grantPremium(fullVersion.purchaseToken);
    return true;
  }
  return false;
}
```

**5.5: Cross-Device via Supabase**

When user purchases on one device and signs in on another:
1. On purchase: Edge Function writes `status = 'active'`, `period_end = NULL` to `subscriptions` table
2. On sign-in: SubscriptionContext fetches `get_subscription_status()` RPC
3. If `is_active = true`: bridge to PremiumContext grants premium locally (see Phase 2)

**No schema change needed.** Using `status = 'active'` with `period_end = NULL` is sufficient and cleaner than adding a new enum value. The RPC already returns `is_active = true` for any `'active'` status regardless of `period_end`.

**Tests:**
- Mock Digital Goods API for unit tests
- Purchase flow: happy path, user cancels, network error
- Restore purchases: found, not found, verification fails
- Cross-device: sign in detects existing purchase
- Acknowledge uses 'onetime' type

---

### Phase 6: Update verify-subscription Edge Function

**Goal:** Handle one-time purchase verification alongside existing subscription support.

**This is a significant update, not a minor change.**

**File:** `supabase/functions/verify-subscription/index.ts`

**Changes needed:**

1. **Accept `purchaseType` parameter:**
```typescript
interface VerifyRequest {
  purchaseToken: string;
  productId: string;
  purchaseType: 'onetime' | 'subscription';  // NEW -- required
}
```

2. **Branch verification by purchase type:**
```typescript
if (purchaseType === 'onetime') {
  // Google Play API: purchases.products.get
  // Endpoint: androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{token}
  // Response: { purchaseState: 0|1, purchaseTimeMillis, consumptionState, ... }
  // purchaseState: 0 = purchased, 1 = cancelled
} else {
  // Existing subscription flow
  // Google Play API: purchases.subscriptions.get
  // Endpoint: androidpublisher/v3/applications/{packageName}/purchases/subscriptions/{productId}/tokens/{token}
  // Response: { expiryTimeMillis, paymentState, ... }
}
```

3. **Store one-time purchase result:**
```typescript
// For one-time purchases: no expiry, no grace period
await supabaseAdmin.rpc('upsert_subscription', {
  p_user_id: userId,
  p_status: 'active',
  p_google_purchase_token: purchaseToken,
  p_google_order_id: orderId ?? null,
  p_product_id: productId,
  p_period_start: new Date().toISOString(),
  p_period_end: null,      // Permanent -- no expiry
  p_grace_end: null,       // No grace period for one-time
});
```

4. **Update mock mode** to support one-time purchases:
```typescript
if (isMockMode && purchaseType === 'onetime') {
  // Accept test tokens for one-time purchases
  status = 'active';
  periodEnd = null;
  graceEnd = null;
}
```

5. **Update `VALID_PRODUCT_IDS`:**
```typescript
const VALID_PRODUCT_IDS = ['premium_unlock', 'matchops_premium_monthly'];
```

6. **Keep existing subscription logic intact** for potential future Pro tier.

**Tests:**
- Edge Function unit tests for one-time purchase verification (mock Google API)
- Test rejection of invalid tokens
- Test mock mode for one-time purchases
- Test upsert stores `period_end = null` for one-time
- Test existing subscription flow still works (regression)

---

### Phase 7: Enable Enforcement & Launch

**Goal:** Flip the switch and go live.

**Steps:**
1. Set `PREMIUM_ENFORCEMENT_ENABLED = true` in `src/config/constants.ts`
2. Verify all tests pass with enforcement enabled
3. Manual testing checklist:

**Free tier testing:**
- [ ] Create 3 seasons -- verify indicators show "1/3", "2/3", "3/3"
- [ ] On season #3 creation -- verify "last free" reminder shown
- [ ] Try creating season #4 -- verify upgrade prompt appears
- [ ] Dismiss upgrade prompt -- verify user stays on free tier, can still use existing seasons
- [ ] Same flow for tournaments
- [ ] Create games without season/tournament -- verify no limit interference
- [ ] Verify Settings shows "Plan: Free" with correct usage counts

**Import/migration testing:**
- [ ] Import backup with 5 seasons as free user -- verify all 5 restored
- [ ] After import, verify "post-import notice" shown
- [ ] After import, try creating new season -- verify blocked at limit (5 >= 3)
- [ ] Local-to-cloud migration with existing data -- verify all data migrates

**Purchase testing:**
- [ ] Purchase full version on Android TWA -- verify limits removed
- [ ] After purchase, Settings shows "Plan: Full Version"
- [ ] After purchase, create season #4 -- verify allowed
- [ ] Sign out and sign in -- verify premium persists
- [ ] New device sign-in -- verify cross-device premium via Supabase
- [ ] Restore purchases on new device -- verify works

**Platform testing:**
- [ ] Android TWA: upgrade button triggers Play Billing
- [ ] Desktop browser: upgrade prompt shows "Available on Android app"
- [ ] Local mode: no limits enforced (always premium)

4. Deploy to staging, full end-to-end testing
5. Update Play Store listing to mention "3 free competitions"
6. Deploy to production

**Pre-launch checklist:**
- [ ] Toiminimi registered (required for accepting payments in Finland)
- [ ] Google Play Console: `premium_unlock` product created and approved
- [ ] Edge Function updated and deployed for one-time purchase verification
- [ ] All limit indicators working in UI
- [ ] Upgrade prompt tested on Android TWA with real purchase
- [ ] Restore purchases tested
- [ ] Cross-device premium tested (purchase on device A, sign in on device B)
- [ ] Import/migration tested with data exceeding limits
- [ ] Play Store listing updated to mention free tier limits
- [ ] i18n keys updated for both English and Finnish
- [ ] Privacy policy reviewed (no changes likely needed for one-time purchase)
- [ ] `PREMIUM_ENFORCEMENT_ENABLED = true` committed
- [ ] All tests pass

---

## Implementation Priority & Dependencies

```
Phase 1 (Limits Config + Product IDs)
    |
    v
Phase 2 (Re-enable Enforcement + SubscriptionContext Bridge)
    |
    v
Phase 3 (Limit Visibility UX)     <-- Testable without billing
    |
    v
Phase 4 (Upgrade Prompt Copy Update)            <-- Testable without billing
    |
    v
Phase 5 (Play Billing)  +  Phase 6 (Edge Function)  <-- Parallel, require Play Store
    |                          |
    v                          v
            Phase 7 (Launch)
```

**Phases 1-4 can be built and tested without any Play Store setup.** The upgrade prompt shows "Purchase not available in this environment" on non-Android, or uses test tokens on Vercel preview. This means the bulk of the work is frontend-only and locally testable.

**Phases 5-6 require:**
- Google Play Console access
- `premium_unlock` product created
- Edge Function deployment to Supabase
- Toiminimi registered

---

## Complete File Change Inventory

Every file that needs changes, organized by phase.

### Phase 1 Files (Config + Resource Type Cleanup)

**Configuration:**
| File | Change |
|------|--------|
| `src/config/premiumLimits.ts` | New limits (3/3), narrow `ResourceType` to season/tournament, new product ID, `PREMIUM_IS_SUBSCRIPTION = false` |
| `src/utils/playBilling.ts` | Rename `SUBSCRIPTION_PRODUCT_ID` -> use `PREMIUM_PRODUCT_ID`; rename `purchaseSubscription()`, `SubscriptionDetails`, `getSubscriptionDetails()` |
| `src/hooks/usePlayBilling.ts` | Update to use renamed functions/types from playBilling.ts |
| `supabase/functions/verify-subscription/index.ts` | Add `premium_unlock` to `VALID_PRODUCT_IDS` |

**Remove old resource type usages (required to avoid build break):**
| File | Change |
|------|--------|
| `src/components/TeamManagerModal.tsx` | Remove `useResourceLimit('team', ...)` |
| `src/components/RosterSettingsModal.tsx` | Remove `useResourceLimit('player', ...)` |
| `src/components/HomePage/utils/newGameHandlers.ts` | Remove `canCreate('game', ...)` and `showUpgradePrompt('game', ...)` (lines 115-139) |
| `src/components/HomePage/hooks/useGameOrchestration.ts` | Remove game limit props if no longer passed |

**Remove `cloudUpgrade` variant (cloud sync is free):**
| File | Change |
|------|--------|
| `src/components/UpgradePromptModal.tsx` | Remove `cloudUpgrade` variant handling |
| `src/app/page.tsx` | Remove post-login cloud upgrade flow (~lines 935-938, 1284-1289) |
| `src/components/CloudSyncSection.tsx` | Remove upgrade prompt for cloud sync |

**i18n:**
| File | Change |
|------|--------|
| `public/locales/en/common.json` | Update limit strings, remove team/player/game limits, update subscription wording |
| `public/locales/fi/common.json` | Same as English |

**Tests (MUST update in Phase 1):**
| File | Change |
|------|--------|
| `src/utils/__tests__/premiumManager.test.ts` | Update for new ResourceType, new limits |
| `src/contexts/__tests__/PremiumContext.test.tsx` | Update resource type mocks |
| `src/components/__tests__/UpgradePromptModal.test.tsx` | Remove cloudUpgrade tests |
| `src/components/__tests__/TeamManagerModal.test.tsx` | Remove premium limit mock/assertions |
| `src/components/__tests__/RosterSettingsModal.test.tsx` | Remove premium limit mock/assertions |
| `src/components/HomePage/utils/__tests__/newGameHandlers.test.ts` | Remove game limit tests |
| `src/components/HomePage/hooks/__tests__/useGameOrchestration.*.test.tsx` | Update `showUpgradePrompt` mocks |
| `src/__tests__/i18n-validation.test.ts` | Update for changed/removed keys |
| `src/components/__tests__/CloudSyncSection.test.tsx` | Remove upgrade prompt tests |

### Phase 2 Files (Enforcement Logic)
| File | Change |
|------|--------|
| `src/utils/premiumManager.ts` | Re-enable `canCreateResource`, `getRemainingCount`, `isOverFreeLimit`; update `ResourceCounts` type |
| `src/contexts/PremiumContext.tsx` | Restore mode-based logic (local=premium, cloud=check license) |
| `src/hooks/usePremiumSubscriptionBridge.ts` | **NEW** -- cross-device bridge hook (check raw `status`, grant premium) |
| `src/components/UpgradePromptManager.tsx` | Call `usePremiumSubscriptionBridge()` hook |

### Phase 3 Files (Limit Visibility UX)
| File | Change |
|------|--------|
| `src/hooks/usePremium.ts` | Add `isApproaching`, `isAtLimit` to `useResourceLimit` return |
| `src/components/SeasonTournamentManagementModal.tsx` | Add "X of 3 free" indicator |
| `src/components/SeasonDetailsModal.tsx` | Add "last free" reminder when `isApproaching` |
| `src/components/TournamentDetailsModal.tsx` | Add "last free" reminder when `isApproaching` |
| `src/components/SettingsModal.tsx` | Add plan/tier section to Account tab |
| `src/utils/fullBackup.ts` | Return counts in import result for post-import notice |
| `public/locales/en/common.json` | Add keys for indicators and reminders |
| `public/locales/fi/common.json` | Same |
| Test files mocking `useResourceLimit` | Add `isApproaching`/`isAtLimit` to mocks (SeasonTournamentManagementModal.test.tsx, etc.) |

### Phase 4 Files (Upgrade Prompt Copy)
| File | Change |
|------|--------|
| `src/components/UpgradePromptModal.tsx` | Update copy for one-time purchase (benefits, button text, non-Android text) |

### Phase 5 Files (Play Billing)
| File | Change |
|------|--------|
| `src/utils/playBilling.ts` | Update purchase flow for one-time; update acknowledge type to 'onetime' |
| `src/hooks/usePlayBilling.ts` | Update purchase/restore for one-time; pass purchaseType to verify |

### Phase 6 Files (Edge Function)
| File | Change |
|------|--------|
| `supabase/functions/verify-subscription/index.ts` | Add `purchaseType` param; branch Google API call (products vs subscriptions endpoint); handle one-time response; store with `period_end = null` |

### Phase 7 Files (Launch)
| File | Change |
|------|--------|
| `src/config/constants.ts` | `PREMIUM_ENFORCEMENT_ENABLED = true` |
| `src/__tests__/security/premium-env.test.ts` | Update assertion: `PREMIUM_ENFORCEMENT_ENABLED` now `true` |
| Play Store listing | Update description to mention free tier limits |

---

## Migration from Old Plan

The previous billing plan (January 2026) was subscription-based with account gating:

| Aspect | Old Plan (Jan 2026) | New Plan (Mar 2026) |
|--------|-------------------|-------------------|
| Account creation | Required payment | Free |
| Payment model | Monthly subscription (4.99 EUR/mo) | One-time purchase (~4.99 EUR) |
| What's gated | Cloud sync access | Competition count (>3 seasons/tournaments) |
| Limits | Teams, games, players, seasons, tournaments | Seasons and tournaments only |
| Grace period | Yes (payment failures) | N/A (permanent purchase) |
| Subscription table | Tracks renewal cycles | Uses `active` + `period_end=NULL` for permanent |
| Edge Function | Validates subscription only | Validates both subscription and one-time |
| SubscriptionContext | Gates cloud sync | Detects premium for cross-device |

---

## Edge Cases & Risk Mitigation

### Refund Handling

**Scenario:** Google refunds a one-time purchase (via Play Console or user complaint).

**Google's behavior:** Purchase `purchaseState` changes from `0` (purchased) to `1` (cancelled). Google can notify via Real-Time Developer Notifications (RTDN) or Voided Purchases API.

**Current plan:** No RTDN integration. This means a refunded user keeps premium locally until:
1. They sign out and sign in (SubscriptionContext re-fetches from Supabase)
2. The Edge Function is called for some other reason and detects the revocation

**Acceptable for launch:** At small scale, refunds are rare and manual handling is fine. If someone refunds and keeps premium for a few days, the cost is negligible.

**Future improvement (if scale justifies):**
- Add periodic re-verification: on app launch, every 24h, check `get_subscription_status()` RPC
- If status is no longer `active`, call `revokePremiumAccess()` locally
- Consider RTDN webhook to update `subscriptions` table on refund events

### Desktop-Only Users

**Scenario:** User only uses the app on desktop browser and wants to purchase.

**Current behavior:** UpgradePromptModal shows "Available on the Android app" with Play Store link.

**Acceptable for launch:** Desktop users are a small minority (app is phone-first). They can:
1. Install the Android app, purchase there, then continue on desktop (cross-device premium works)
2. Use the free tier (3 seasons + 3 tournaments is generous)

**Future improvement:** Add web-based payment option (Stripe or similar) if desktop user base grows.

### Existing Data Migration

**Scenario:** App launches with limits enabled. Existing users already have >3 seasons.

**Impact:** None -- limits only gate NEW creation. Existing data is never restricted. Existing users who already have >3 seasons simply can't create new ones without purchasing.

---

## Future Considerations

### Phase 2 Monetization (Pro Tier)

If a Pro subscription tier is added later (see monetization-strategies.md):
- The `subscriptions` table already supports recurring subscriptions
- The Edge Function keeps subscription verification alongside one-time
- Add a second product ID (`matchops_pro_annual`)
- Full Version buyers are grandfathered (unlimited competitions forever)
- Pro adds NEW features on top (analytics, reports)

### Phase 3 Monetization (Club Tier)

Club tier would be a separate system entirely:
- Multi-tenant backend
- Organization management
- Not through Play Store billing (direct B2B invoicing)
- Separate implementation plan when/if needed
