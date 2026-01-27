# Auth/Data/Migration Scenario Matrix

**Purpose**: Comprehensive checklist of all possible user paths through authentication, data migration, and mode switching flows. Each scenario should be verified to work correctly before release.

**Scope**: Everything from app launch until user reaches main app functionality. NOT in-app business logic.

---

## Entry State Variables

When a user opens the app, these variables determine their starting state:

| Variable | Possible Values |
|----------|-----------------|
| **Local Data** | None / Exists / Corrupted |
| **Cloud Account** | None / Exists (logged out) / Exists (logged in) |
| **Cloud Data** | None / Exists / Different from local |
| **Subscription** | None / Active / Expired |
| **Network** | Online / Offline |
| **Device** | First device / Additional device |

---

## 1. First-Time Users (No Local Data, No Account)

### 1.1 Happy Paths

- [ ] **1.1.1** New user → Start local mode → Use app locally
- [ ] **1.1.2** New user → Create account → Start fresh in cloud mode
- [ ] **1.1.3** New user → Create account → Subscribe to premium → Start in cloud mode
- [ ] **1.1.4** New user → Import backup file → Use app locally
- [ ] **1.1.5** New user → Import backup file → Create account → Migrate imported data to cloud

### 1.2 Winding Paths

- [ ] **1.2.1** New user → Start local mode → Change mind → Go back → Create account instead
- [ ] **1.2.2** New user → Start creating account → Cancel → Start local mode instead
- [ ] **1.2.3** New user → Import backup → Realize wrong file → Cancel → Import different file
- [ ] **1.2.4** New user → Create account → Fail (network) → Retry → Success
- [ ] **1.2.5** New user → Create account → Fail (email taken) → Use different email

### 1.3 Edge Cases

- [ ] **1.3.1** New user → Offline → Try to create account → Shown appropriate error → Start local instead
- [ ] **1.3.2** New user → Import corrupted backup file → Error handled → Can try again or start fresh
- [ ] **1.3.3** New user → Close app mid-signup → Reopen → State is clean (no half-created account)

---

## 2. Returning Local Users (Has Local Data, No Account)

### 2.1 Happy Paths

- [ ] **2.1.1** Returning local user → Auto-enters local mode → Uses app
- [ ] **2.1.2** Returning local user → Decides to create account → Migrates local data to cloud
- [ ] **2.1.3** Returning local user → Creates account → Chooses NOT to migrate → Starts fresh in cloud
- [ ] **2.1.4** Returning local user → Exports backup → Creates account → Imports backup to cloud

### 2.2 Winding Paths

- [ ] **2.2.1** Local user → Start migration wizard → Cancel midway → Return to local mode (data intact)
- [ ] **2.2.2** Local user → Create account → Start migration → Network fails → Retry later → Complete
- [ ] **2.2.3** Local user → Create account → Migrate → Realize wants local → Reverse migrate back
- [ ] **2.2.4** Local user → Try to login (no account exists) → Error → Create account instead
- [ ] **2.2.5** Local user → Create account → Close app mid-migration → Reopen → Can resume or restart

### 2.3 Edge Cases

- [ ] **2.3.1** Local user with 500+ games → Migration handles large dataset → Progress shown
- [ ] **2.3.2** Local user → Offline → Cannot create account → Clear message → Can continue local
- [ ] **2.3.3** Local user → Corrupted local data detected → Option to export what's salvageable

---

## 3. Returning Cloud Users (Has Account, Coming Back)

### 3.1 Happy Paths

- [ ] **3.1.1** Cloud user (same device) → Auto-logged in → Session valid → Enters app
- [ ] **3.1.2** Cloud user (same device) → Session expired → Login prompt → Logs in → Enters app
- [ ] **3.1.3** Cloud user (new device) → Login → Data syncs from cloud → Uses app
- [ ] **3.1.4** Cloud user → Forgot password → Reset flow → New password → Login

### 3.2 Winding Paths

- [ ] **3.2.1** Cloud user → Login fails (wrong password) → Retry → Success
- [ ] **3.2.2** Cloud user → Login fails → Forgot password → Reset → Login with new password
- [ ] **3.2.3** Cloud user → Start login → Cancel → Use as local instead (if local data exists)
- [ ] **3.2.4** Cloud user → Login → Subscription expired → Shown upgrade prompt → Can still use (limited?)
- [ ] **3.2.5** Cloud user → Login on new device → Also has local data on this device → Merge decision

### 3.3 Edge Cases

- [ ] **3.3.1** Cloud user → Offline → Cannot login → Can use cached local data if any
- [ ] **3.3.2** Cloud user → Account deleted server-side → Login fails → Clear error message
- [ ] **3.3.3** Cloud user → Token refresh fails repeatedly → Forced re-login

---

## 4. Mixed State Users (Has Both Local Data AND Cloud Account)

### 4.1 Happy Paths

- [ ] **4.1.1** Mixed user → Login → Choose to merge local into cloud → Merge completes
- [ ] **4.1.2** Mixed user → Login → Choose to discard local → Uses cloud data only
- [ ] **4.1.3** Mixed user → Login → Choose to keep local separate → Switch modes manually later

### 4.2 Winding Paths

- [ ] **4.2.1** Mixed user → Start merge → Preview conflicts → Cancel → Keep separate for now
- [ ] **4.2.2** Mixed user → Merge → Realize mistake → Reverse migrate cloud → Local restored
- [ ] **4.2.3** Mixed user → Login → Logout → Back to local mode → Data still there
- [ ] **4.2.4** Mixed user → Discard local → Regret → Cannot undo (warned appropriately)
- [ ] **4.2.5** Mixed user → Merge fails midway → Rollback → Both datasets intact

### 4.3 Edge Cases

- [ ] **4.3.1** Mixed user → Local and cloud have same game ID but different data → Conflict resolution
- [ ] **4.3.2** Mixed user → Local has 100 games, cloud has 100 different games → Large merge
- [ ] **4.3.3** Mixed user → Offline → Can only access local data → Clear indicator of mode

---

## 5. Mode Switching (After Initial Setup)

### 5.1 Local → Cloud Transitions

- [ ] **5.1.1** Local user → Settings → Create account → Migrate data → Now in cloud mode
- [ ] **5.1.2** Local user → Settings → Login to existing account → Migrate or merge
- [ ] **5.1.3** Local user → Settings → Create account → Subscribe → Migrate → Premium cloud

### 5.2 Cloud → Local Transitions

- [ ] **5.2.1** Cloud user → Settings → Switch to local → Data exported/migrated locally
- [ ] **5.2.2** Cloud user → Settings → Logout → Continues with cached local data
- [ ] **5.2.3** Cloud user → Settings → Delete account → Data migrated to local first → Account deleted
- [ ] **5.2.4** Cloud user → Subscription expires → Downgrade to local mode (data preserved)

### 5.3 Winding Mode Switches

- [ ] **5.3.1** Local → Cloud → Regret → Back to Local (full round trip)
- [ ] **5.3.2** Cloud → Local → Miss sync → Back to Cloud (full round trip)
- [ ] **5.3.3** User switches modes 5+ times → All data preserved correctly
- [ ] **5.3.4** Mode switch interrupted (app closed) → Reopen → Clean state (not half-switched)

---

## 6. Subscription Flows

### 6.1 Happy Paths

- [ ] **6.1.1** Free user → Subscribe via Play Store → Subscription verified → Premium features unlock
- [ ] **6.1.2** Premium user → Subscription renews automatically → No interruption
- [ ] **6.1.3** Premium user → Cancels → Uses until end of period → Downgrades gracefully

### 6.2 Winding Paths

- [ ] **6.2.1** User → Start subscription → Cancel in Play Store UI → Returns to app unchanged
- [ ] **6.2.2** User → Subscribe → Payment fails → Retry → Success
- [ ] **6.2.3** User → Subscribe on device A → Login on device B → Subscription recognized

### 6.3 Edge Cases

- [ ] **6.3.1** Subscription verification fails (network) → Grace period → Retry later
- [ ] **6.3.2** Play Store returns unexpected error → Handled gracefully → User informed
- [ ] **6.3.3** User has subscription but server can't verify → Fallback behavior defined
- [ ] **6.3.4** Subscription expires while offline → Handled on next online check

---

## 7. Import/Export/Backup Flows

### 7.1 Happy Paths

- [ ] **7.1.1** User → Export all data to JSON → File saved successfully
- [ ] **7.1.2** User → Import JSON backup → Data restored → Confirmation shown
- [ ] **7.1.3** User → Export from local mode → Create account → Import to cloud

### 7.2 Winding Paths

- [ ] **7.2.1** User → Start import → Wrong file selected → Cancel → Select correct file
- [ ] **7.2.2** User → Import → Has existing data → Choose merge vs replace
- [ ] **7.2.3** User → Export → File save fails → Retry → Success
- [ ] **7.2.4** User → Import partial backup → Only available data imported → Summary shown

### 7.3 Edge Cases

- [ ] **7.3.1** Import file from older app version → Migration applied during import
- [ ] **7.3.2** Import file from newer app version → Handled gracefully (or warned)
- [ ] **7.3.3** Import very large file (1000+ games) → Progress shown → Doesn't freeze UI
- [ ] **7.3.4** Import malformed/corrupted JSON → Error caught → User informed → No data loss

---

## 8. Account Management

### 8.1 Happy Paths

- [ ] **8.1.1** User → Delete account → Confirm → Data migrated to local → Account removed
- [ ] **8.1.2** User → Change email → Verification sent → Confirmed → Updated
- [ ] **8.1.3** User → Change password → Old password verified → New password set

### 8.2 Winding Paths

- [ ] **8.2.1** User → Start delete account → Cancel → Account intact
- [ ] **8.2.2** User → Delete account → Offline → Queued or blocked with message
- [ ] **8.2.3** User → Change email → Don't verify → Old email still works

### 8.3 Edge Cases

- [ ] **8.3.1** Delete account with active subscription → Subscription handling defined
- [ ] **8.3.2** Account deletion fails server-side → User informed → Can retry
- [ ] **8.3.3** Change email to already-used email → Clear error message

---

## 9. Error Recovery Scenarios

### 9.1 Network Failures

- [ ] **9.1.1** Network fails during account creation → Can retry → No orphan account created
- [ ] **9.1.2** Network fails during migration → Partial state handled → Can resume
- [ ] **9.1.3** Network fails during login → Clear message → Can retry or go local
- [ ] **9.1.4** Intermittent network during sync → Automatic retry → Eventually succeeds

### 9.2 Data Corruption

- [ ] **9.2.1** Local IndexedDB corrupted → Detected → User can export salvageable data
- [ ] **9.2.2** Cloud data corrupted → Detected → Fallback to local or restore from backup
- [ ] **9.2.3** Migration creates invalid state → Rollback works → Original data safe

### 9.3 App Interruption

- [ ] **9.3.1** App killed during signup → Reopen → Clean state, can start over
- [ ] **9.3.2** App killed during migration → Reopen → Can resume or restart
- [ ] **9.3.3** App killed during import → Reopen → Original data intact, can retry import
- [ ] **9.3.4** Phone dies during sync → Recharge → Reopen → Consistent state

---

## 10. Multi-Device Scenarios

### 10.1 Happy Paths

- [ ] **10.1.1** User logs in on second device → Cloud data available → Uses normally
- [ ] **10.1.2** User makes changes on device A → Reflected on device B after refresh
- [ ] **10.1.3** User logs out on device A → Device B unaffected (still logged in)

### 10.2 Winding Paths

- [ ] **10.2.1** Device A and B both offline → Both make changes → Both come online → Last write wins
- [ ] **10.2.2** User on device A → Deletes account → Device B handles gracefully
- [ ] **10.2.3** Subscription purchased on A → Recognized on B without re-purchase

### 10.3 Edge Cases

- [ ] **10.3.1** Same user logged in on 10+ devices → All work correctly
- [ ] **10.3.2** Password changed on device A → Device B session invalidated → Re-login required
- [ ] **10.3.3** User restores device from backup → Old tokens handled → Fresh login if needed

---

## 11. Unusual/Chaotic User Journeys

These simulate real users who change their mind, get confused, or take unexpected paths.

### 11.1 The Indecisive User

- [ ] **11.1.1** New → Start local → Back → Create account → Back → Start local → Back → Create account → Complete
- [ ] **11.1.2** Has local data → Create account → Cancel → Try login (no account) → Error → Create account → Complete
- [ ] **11.1.3** Cloud user → Logout → Create NEW account (different email) → Now has two accounts

### 11.2 The Explorer

- [ ] **11.2.1** Opens every option in welcome screen without completing any → Eventually picks one → Works
- [ ] **11.2.2** Starts migration → Checks every option → Goes back multiple times → Finally completes
- [ ] **11.2.3** Creates account → Immediately tries to delete it → Handles gracefully

### 11.3 The Returner

- [ ] **11.3.1** Used app 2 years ago → Returns → Old local data still there → Can migrate or continue
- [ ] **11.3.2** Had cloud account → Forgot password → Forgot email → Cannot recover → Starts fresh
- [ ] **11.3.3** Had premium → Cancelled year ago → Returns → Subscription status correct (inactive)

### 11.4 The Complex Journey

- [ ] **11.4.1** Start local → Use for a month → Create account → Migrate → Use cloud → Switch back to local → Migrate back → Switch to cloud again
- [ ] **11.4.2** Import old backup → Create account → Sync → Export new backup → Delete account → Import backup on new device
- [ ] **11.4.3** Local with 50 games → Create account → Migrate → Delete account (data to local) → Create NEW account → Migrate same data again

### 11.5 The Accidental User

- [ ] **11.5.1** Taps "create account" accidentally → Can easily go back without consequences
- [ ] **11.5.2** Starts typing password → Closes keyboard → Closes app → Reopens → Form state reasonable
- [ ] **11.5.3** Selects wrong migration option → Has chance to confirm before irreversible action

---

## 12. Security-Related Scenarios

### 12.1 Authentication Security

- [ ] **12.1.1** Brute force login attempts → Rate limited → User informed
- [ ] **12.1.2** Session stolen (hypothetical) → User can invalidate all sessions
- [ ] **12.1.3** Password reset link expires → Clear message → Can request new one

### 12.2 Data Security

- [ ] **12.2.1** User A cannot access User B's data (RLS working)
- [ ] **12.2.2** Exported backup doesn't contain other users' data
- [ ] **12.2.3** Deleted account data is actually removed from server

---

## Summary Statistics

| Category | Total Scenarios |
|----------|-----------------|
| 1. First-Time Users | 13 |
| 2. Returning Local Users | 11 |
| 3. Returning Cloud Users | 11 |
| 4. Mixed State Users | 11 |
| 5. Mode Switching | 10 |
| 6. Subscription Flows | 10 |
| 7. Import/Export/Backup | 12 |
| 8. Account Management | 9 |
| 9. Error Recovery | 12 |
| 10. Multi-Device | 9 |
| 11. Unusual Journeys | 15 |
| 12. Security | 6 |
| **TOTAL** | **129** |

---

## Verification Notes

When verifying each scenario:

1. **Test manually** - Walk through the exact steps
2. **Check data integrity** - Verify no data loss or corruption
3. **Check UI feedback** - User always knows what's happening
4. **Check error messages** - Clear, actionable, no technical jargon
5. **Check recovery** - User can always get to a working state

Mark scenarios with:
- [x] Verified working
- [~] Partially working (note issues)
- [!] Broken (create issue)
- [-] Not applicable (explain why)
