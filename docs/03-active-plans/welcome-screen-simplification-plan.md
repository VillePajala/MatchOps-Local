# Welcome Screen Simplification Plan

**Status**: Ready for Implementation
**Created**: 2026-02-06
**Last Verified**: 2026-02-06
**Priority**: High - Fixes user confusion during local→cloud transition
**Related Issues**: Issue #336 (Auth ≠ Sync separation)

---

## Problem Statement

Users get confused when transitioning from local to cloud mode because:

1. **WelcomeScreen "Sign in" is misleading**: The current "Sign in or create account" option (lines 141-157 in `WelcomeScreen.tsx`) shows an auth modal but **stays in local mode**. Users expect signing in = cloud sync, but auth ≠ sync.

2. **No escape path**: Once in local mode, there's no way to return to WelcomeScreen to "start over" with a different account or mode. Sign Out (CloudSyncSection line 365) keeps you in cloud mode and shows LoginScreen.

3. **Pricing mentions**: €4.99/month is mentioned on WelcomeScreen (line 154, uses `signInCloudDescWithPrice` translation key) even though we're going free for now.

4. **Three options overwhelm**: "Start Fresh", "Sign In", and "Import Backup" as equal choices creates decision paralysis.

---

## Solution Overview

| Change | Description | Complexity |
|--------|-------------|------------|
| **Simplify WelcomeScreen** | 2 primary paths + import link | Medium |
| **Add "Start Over" to CloudSyncSection** | Sign out + disable cloud + clear welcome flag + reload | Low |
| **Remove pricing text** | Update translation key and WelcomeScreen | Low |
| **Cloud always free** | ✅ Already done in `PremiumContext.tsx` (lines 55-58) | None |

---

## Code Verification Summary

### Verified Files and Key Lines

| File | Key Lines | Current State |
|------|-----------|---------------|
| `src/components/WelcomeScreen.tsx` | 25-36 (props), 38-44 (destructure), 141-157 (cloud button), 159-175 (import button) | Props: `onStartLocal`, `onSignInCloud`, `onImportBackup`, `isCloudAvailable`, `isImporting` |
| `src/app/page.tsx` | 62-63 (state), 248-270 (handlers), 1078-1092 (render + AuthModal) | `showAuthModal` state at line 63, `handleWelcomeSignInCloud` shows AuthModal |
| `src/components/CloudSyncSection.tsx` | 7-15 (imports), 365-407 (handleSignOut), 727-782 (cloud mode section) | Sign out stays in cloud mode, shows LoginScreen. `clearWelcomeSeen` NOT currently imported. |
| `src/config/backendConfig.ts` | 180-193 (enableCloudMode - **synchronous, returns boolean**), 547-552 (clearWelcomeSeen) | `enableCloudMode()` returns `boolean`, NOT a Promise |
| `src/contexts/PremiumContext.tsx` | 55-58 | `setIsPremium(true)` always - limits disabled ✓ |
| `src/config/premiumLimits.ts` | 30-32 | `PREMIUM_PRICE = '€ 4,99/kk'` - can be commented out |
| `public/locales/*/common.json` | 2567 | `signInCloudDescWithPrice` contains €4.99 |
| `src/components/__tests__/WelcomeScreen.test.tsx` | 40-44 (mockHandlers), 91, 119 (€4.99 assertions) | Tests reference `onSignInCloud` and €4.99 text |

---

## Detailed Implementation

### 1. WelcomeScreen Simplification

**Current Props** (`src/components/WelcomeScreen.tsx` lines 25-36):
```tsx
interface WelcomeScreenProps {
  onStartLocal: () => void;      // "Start without an account"
  onSignInCloud: () => void;     // Shows auth modal, STAYS LOCAL (confusing!)
  onImportBackup: () => void;    // Import backup
  isCloudAvailable: boolean;
  isImporting: boolean;
}
```

**Proposed Props** (rename for clarity):
```tsx
interface WelcomeScreenProps {
  onStartLocal: () => void;      // Same - stays local
  onUseCloudSync: () => void;    // RENAMED - enables cloud mode + shows login
  onImportBackup: () => void;    // Same - import to local
  isCloudAvailable: boolean;
  isImporting: boolean;
}
```

#### 1.1 WelcomeScreen UI Changes

**File**: `src/components/WelcomeScreen.tsx`

**Change 1**: Update props interface (line 29)
```diff
-  /** Called when user chooses "Sign In to Cloud" */
-  onSignInCloud: () => void;
+  /** Called when user chooses "Use Cloud Sync" - enables cloud mode */
+  onUseCloudSync: () => void;
```

**Change 2**: Update destructuring (line 40)
```diff
-  onSignInCloud,
+  onUseCloudSync,
```

**Change 3**: Replace cloud option button (lines 139-157, including comments)
```tsx
{/* Use Cloud Sync - only if Supabase is configured */}
{isCloudAvailable && (
  <button
    onClick={onUseCloudSync}
    className="w-full p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all text-left"
    aria-label={t('welcome.useCloudSyncAria', 'Use cloud sync, access from any device')}
  >
    <div className="text-white font-semibold text-lg">
      {t('welcome.useCloudSync', 'Use Cloud Sync')}
    </div>
    <div className="text-green-400 text-xs font-medium uppercase tracking-wide mb-1">
      {t('welcome.badgeFree', 'FREE')}
    </div>
    <div className="text-slate-400 text-sm">
      {t('welcome.useCloudSyncDesc', 'Sync your data across all your devices.')}
    </div>
  </button>
)}
```

**Change 4**: Make import backup a footer link (replace lines 159-175, move to after buttons div)
```tsx
{/* Import backup as footer link */}
<p className="text-center text-slate-500 text-sm mt-4">
  <button
    onClick={onImportBackup}
    disabled={isImporting}
    className="text-slate-400 hover:text-white underline transition-colors disabled:opacity-50"
  >
    {isImporting
      ? t('welcome.importing', 'Importing...')
      : t('welcome.haveBackup', 'Have a backup file?')}
  </button>
</p>
```

#### 1.2 page.tsx Handler Changes

**File**: `src/app/page.tsx`

**Change 1**: Remove `showAuthModal` state (line 63) - no longer needed
```diff
-  // Issue #336: Auth modal for sign-in from welcome screen (stays in local mode)
-  const [showAuthModal, setShowAuthModal] = useState(false);
```

**Change 2**: Replace `handleWelcomeSignInCloud` (lines 248-253) with new handler

**IMPORTANT**: `enableCloudMode()` is **synchronous** and returns `boolean` (not async/Promise).

```tsx
// Handle "Use Cloud Sync" from welcome screen
// This ENABLES cloud mode AND shows login - clear intent, no confusion
const handleWelcomeUseCloudSync = useCallback(() => {
  logger.info('[page.tsx] Welcome: User chose cloud sync - enabling cloud mode');

  // Enable cloud mode first (synchronous, returns boolean)
  const success = enableCloudMode();

  if (!success) {
    logger.error('[page.tsx] Failed to enable cloud mode');
    showToast(t('page.cloudSyncNotAvailable', 'Cloud sync is not available'), 'error');
    return;
  }

  // Only set welcome seen AFTER successful enable
  setWelcomeSeen();

  logger.info('[page.tsx] Cloud mode enabled, reloading...');
  showToast(t('page.cloudModeEnabledReloading', 'Cloud mode enabled. Reloading...'), 'info');

  // Reload to enter cloud mode - LoginScreen will show automatically
  setTimeout(() => {
    window.location.reload();
  }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
}, [showToast, t]);
```

**Change 3**: Remove unused handlers (lines 255-270)
```diff
-  // Handle successful auth from welcome screen's auth modal
-  // Issue #336: User signed in but stays in local mode - sync is a separate toggle
-  const handleWelcomeAuthSuccess = useCallback(() => {
-    logger.info('[page.tsx] Welcome: Auth successful - dismissing welcome, staying in local mode');
-    setShowAuthModal(false);
-    setWelcomeSeen();
-    setShowWelcome(false);
-    // Trigger app state refresh to pick up authenticated state
-    setRefreshTrigger(prev => prev + 1);
-  }, []);
-
-  // Handle auth modal cancel from welcome screen
-  const handleWelcomeAuthCancel = useCallback(() => {
-    logger.info('[page.tsx] Welcome: Auth modal cancelled');
-    setShowAuthModal(false);
-  }, []);
```

**Change 4**: Update WelcomeScreen render (lines 1078-1084)
```diff
  <WelcomeScreen
    onStartLocal={handleWelcomeStartLocal}
-   onSignInCloud={handleWelcomeSignInCloud}
+   onUseCloudSync={handleWelcomeUseCloudSync}
    onImportBackup={handleWelcomeImportBackup}
    isCloudAvailable={isCloudAvailable()}
    isImporting={isImportingBackup}
  />
```

**Change 5**: Remove AuthModal block (lines 1085-1092)
```diff
-  {/* Issue #336: Auth modal for sign-in from welcome screen (stays in local mode) */}
-  {showAuthModal && (
-    <AuthModal
-      onSuccess={handleWelcomeAuthSuccess}
-      onCancel={handleWelcomeAuthCancel}
-      allowRegistration={true}
-    />
-  )}
```

---

### 2. "Start Over" Feature in CloudSyncSection

**Problem**: Current `handleSignOut` (line 365-407) stays in cloud mode. User sees LoginScreen, not WelcomeScreen.

**Solution**: Add separate "Start Over" button that:
1. Signs out
2. Disables cloud mode
3. Clears welcome seen flag
4. Reloads → shows WelcomeScreen

**File**: `src/components/CloudSyncSection.tsx`

**Change 1**: Add handler after `handleSignOut` (~line 408)
```tsx
/**
 * Handle "Start Over" - sign out, disable cloud mode, return to WelcomeScreen.
 * Different from Sign Out which stays in cloud mode and shows LoginScreen.
 */
const handleStartOver = async () => {
  setIsSigningOut(true);
  try {
    // 1. Clear migration completed flag (while we still have user ID)
    if (user?.id) {
      clearMigrationCompleted(user.id);
    }

    // 2. Sign out
    const { getAuthService } = await import('@/datastore/factory');
    const authService = await getAuthService();
    await authService.signOut();

    // 3. Clear welcome seen flag to show WelcomeScreen
    const { clearWelcomeSeen, disableCloudMode } = await import('@/config/backendConfig');
    clearWelcomeSeen();

    // 4. Disable cloud mode
    disableCloudMode();

    showToast(
      t('cloudSync.startingOver', 'Starting over. Reloading...'),
      'success'
    );

    // 5. Reload after brief delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    logger.error('[CloudSyncSection] Failed to start over:', error);
    showToast(
      t('cloudSync.startOverError', 'Failed to start over. Please try again.'),
      'error'
    );
    if (isMountedRef.current) {
      setIsSigningOut(false);
    }
  }
};
```

**Change 2**: Add UI link inside the cloud mode div (insert before line 781, the closing `</div>` of the cloud mode section)

The cloud mode section is lines 727-782. Insert this after the subscription buttons block (after line 780):

```tsx
{/* Start Over link - return to WelcomeScreen with different account */}
<button
  onClick={handleStartOver}
  disabled={isSigningOut || isChangingMode}
  className="w-full text-center text-slate-400 hover:text-white text-sm underline transition-colors disabled:opacity-50 pt-2"
>
  {t('cloudSync.startOver', 'Start over with a different account')}
</button>
```

This places the "Start Over" link at the bottom of the cloud mode section, visible to all cloud users.

---

### 3. Remove €4.99 Pricing

**Already done**: `PremiumContext.tsx` (lines 55-58) grants premium to everyone.

**Remaining**: Remove text references.

#### 3.1 Update Translation Keys

**File**: `public/locales/en/common.json` (line 2567)
```diff
-  "signInCloudDescWithPrice": "Create a free account. Cloud sync available for €4.99/month.",
+  "signInCloudDescWithPrice": "Sync your data across all your devices.",
```

Note: This key will no longer be used after the simplification. Adding new keys instead:
```json
"useCloudSync": "Use Cloud Sync",
"useCloudSyncDesc": "Sync your data across all your devices.",
"useCloudSyncAria": "Use cloud sync, access from any device",
"haveBackup": "Have a backup file?",
```

**File**: `public/locales/fi/common.json` (line 2567)
```diff
-  "signInCloudDescWithPrice": "Luo ilmainen tili. Pilvisynkronointi 4,99 €/kk.",
+  "signInCloudDescWithPrice": "Synkronoi tietosi kaikilla laitteillasi.",
```

New Finnish keys:
```json
"useCloudSync": "Käytä pilvisynkronointia",
"useCloudSyncDesc": "Synkronoi tietosi kaikilla laitteillasi.",
"useCloudSyncAria": "Käytä pilvisynkronointia, pääsy kaikilta laitteilta",
"haveBackup": "Onko sinulla varmuuskopio?",
```

#### 3.2 Update Test File

**File**: `src/components/__tests__/WelcomeScreen.test.tsx`

Update tests that reference:
- `onSignInCloud` → `onUseCloudSync`
- €4.99 text → new description text
- Line 41-44 (mockHandlers)
- Line 91, 119 (assertions with price text)

---

## Translation Changes Summary

### English (`public/locales/en/common.json`)

**Add in `welcome` section** (~after line 2562):
```json
"useCloudSync": "Use Cloud Sync",
"useCloudSyncDesc": "Sync your data across all your devices.",
"useCloudSyncAria": "Use cloud sync, access from any device",
"haveBackup": "Have a backup file?"
```

**Add in `cloudSync` section**:
```json
"startOver": "Start over with a different account",
"startingOver": "Starting over. Reloading...",
"startOverError": "Failed to start over. Please try again."
```

### Finnish (`public/locales/fi/common.json`)

**Add in `welcome` section**:
```json
"useCloudSync": "Käytä pilvisynkronointia",
"useCloudSyncDesc": "Synkronoi tietosi kaikilla laitteillasi.",
"useCloudSyncAria": "Käytä pilvisynkronointia, pääsy kaikilta laitteilta",
"haveBackup": "Onko sinulla varmuuskopio?"
```

**Add in `cloudSync` section**:
```json
"startOver": "Aloita alusta toisella tilillä",
"startingOver": "Aloitetaan alusta. Ladataan uudelleen...",
"startOverError": "Alusta aloittaminen epäonnistui. Yritä uudelleen."
```

---

## Files Summary

| File | Change Type | Key Lines | Risk |
|------|-------------|-----------|------|
| `src/components/WelcomeScreen.tsx` | Modify | 29 (prop), 40 (destructure), 141-176 (buttons layout) | Medium |
| `src/app/page.tsx` | Modify | 63 (remove state), 248-270 (replace handlers), 1078-1092 (render) | Medium |
| `src/components/CloudSyncSection.tsx` | Modify | Add handler after line 407, add button before line 781 | Low |
| `src/components/__tests__/WelcomeScreen.test.tsx` | Modify | 40-44 (mockHandlers prop name), 91, 119 (€4.99 text) | Low |
| `public/locales/en/common.json` | Modify | welcome section (~2547), cloudSync section | Low |
| `public/locales/fi/common.json` | Modify | welcome section (~2547), cloudSync section | Low |

---

## Complexity Assessment

| Task | Effort | Risk | Notes |
|------|--------|------|-------|
| WelcomeScreen UI changes | 1.5 hours | Medium | Rename prop, change layout |
| page.tsx handler updates | 1 hour | Medium | Remove auth modal flow, add new handler |
| "Start Over" feature | 1 hour | Low | Add handler + button in CloudSyncSection |
| Translation changes | 30 min | Low | Add new keys, update existing |
| Update tests | 1 hour | Low | Update WelcomeScreen tests |
| Manual testing | 2 hours | - | All user flows |
| **Total** | **~7 hours** | **Medium** | |

---

## Risk Assessment

### Medium Risk

1. **WelcomeScreen prop rename may break tests**
   - `onSignInCloud` → `onUseCloudSync`
   - Test file lines to update: 40-44 (mockHandlers), 91 and 119 (€4.99 text assertions)
   - **Mitigation**: Update `WelcomeScreen.test.tsx` simultaneously

2. **Cloud enable flow state transitions**
   - `handleWelcomeUseCloudSync` enables cloud mode then reloads
   - Risk: Edge case where enable fails but welcome flag is set
   - **Mitigation**: Handler calls `setWelcomeSeen()` only AFTER `enableCloudMode()` returns `true`

### Low Risk

3. **LoginScreen "Back" button flow**
   - `handleLoginBack` (line 323-327) sets `showWelcome(true)` - this still works correctly
   - The Back flow returns to WelcomeScreen regardless of our changes

4. **Translation key mismatches**
   - **Mitigation**: Test both EN and FI manually

---

## Verification Steps

### Manual Testing Checklist

1. **Fresh install (local path)**:
   - [ ] Clear localStorage, reload
   - [ ] WelcomeScreen shows 2 primary options + footer link
   - [ ] Click "Use Locally" → StartScreen shows
   - [ ] No auth modal appears

2. **Fresh install (cloud path)**:
   - [ ] Clear localStorage, reload
   - [ ] Click "Use Cloud Sync"
   - [ ] Toast shows "Cloud mode enabled. Reloading..."
   - [ ] App reloads, LoginScreen shows
   - [ ] After login → StartScreen with cloud sync enabled

3. **Fresh install (import path)**:
   - [ ] Clear localStorage, reload
   - [ ] Click "Have a backup file?" footer link
   - [ ] File picker opens
   - [ ] Import succeeds → StartScreen with data

4. **"Start Over" from cloud mode**:
   - [ ] In cloud mode, authenticated
   - [ ] Go to Settings → Account & Sync
   - [ ] Click "Start over with a different account"
   - [ ] App reloads to WelcomeScreen
   - [ ] User is signed out
   - [ ] Mode is now local

5. **"Sign Out" still works as before**:
   - [ ] In cloud mode, authenticated
   - [ ] Click "Sign Out" button
   - [ ] App reloads to LoginScreen (not WelcomeScreen)
   - [ ] Mode is still cloud

6. **No €4.99 visible**:
   - [ ] WelcomeScreen shows no €4.99 text
   - [ ] All options show "FREE" badge

### Automated Tests to Update

- [ ] `WelcomeScreen.test.tsx` - update prop name and text assertions
- [ ] Consider adding `CloudSyncSection.test.tsx` test for "Start Over"

---

## Implementation Order

1. **Translations first** - Add all new keys to avoid missing translation errors
2. **WelcomeScreen.tsx** - Update props and UI
3. **WelcomeScreen.test.tsx** - Update tests to match new props/text
4. **page.tsx** - Replace handlers, remove auth modal state
5. **CloudSyncSection.tsx** - Add "Start Over" handler and button
6. **Manual testing** - Verify all flows work correctly
7. **Code review** - Check edge cases

---

## Rollback Plan

If issues arise:
1. Revert WelcomeScreen.tsx to previous version
2. Revert page.tsx handler changes
3. Revert CloudSyncSection.tsx changes
4. Translation keys can remain (unused keys don't break anything)

---

## Related Documents

- [cloud-sync-user-flows.md](./cloud-sync-user-flows.md) - Detailed user flow diagrams
- [supabase-implementation-guide.md](./supabase-implementation-guide.md) - Backend context
