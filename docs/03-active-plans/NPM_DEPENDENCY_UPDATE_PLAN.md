# NPM Dependency Update Plan

**Created:** 2025-11-18
**Status:** ✅ Phase 1 & 2 Complete (2025-12-03)
**Priority:** P0 (Critical security fix required)

## Executive Summary

Comprehensive analysis of NPM dependencies reveals generally healthy dependency tree with one critical security issue and several recommended updates for performance and feature improvements.

**Overall Assessment:** ✅ Dependency health is GOOD

**Key Findings:**
- 1 critical security vulnerability (xlsx)
- 7 deprecated transitive dependencies (low priority, test tools only)
- Multiple safe minor/patch updates available
- 2 major version updates available (Jest 30, Next.js 16)
- No unused dependencies
- No peer dependency conflicts

---

## Phase 1: Critical Security Fix (P0 - Do Immediately)

**Estimated Time:** 30 minutes
**Risk:** 🔴 HIGH if not fixed

### Issue: xlsx Security Vulnerability

**Current Version:** 0.20.3 (from CDN)
**Issue:** Known vulnerabilities (CVE-2023-30533 and others)
**Action Required:** Update to latest secure version from SheetJS CDN

```bash
# Fix xlsx vulnerability
npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
npm test  # Verify Excel export functionality
npm run build  # Verify production build
```

**Testing Checklist:**
- [ ] Excel export creates valid .xlsx files
- [ ] Game statistics export works correctly
- [ ] Tournament data export functions properly
- [ ] Production build passes without errors

---

## Phase 2: Safe Minor/Patch Updates (P1 - This Week)

**Estimated Time:** 1.5 hours
**Risk:** 🟢 LOW - Minor/patch versions only

### 1. Update Sentry (10.12.0 → 10.28.0) ✅ DONE

Latest features and bug fixes for error monitoring.

```bash
npm install @sentry/nextjs@latest
npm test
npm run build
```

**Benefits:**
- Latest error tracking improvements
- Bug fixes and performance enhancements
- Better React 19 compatibility

### 2. Update React Query (5.90.2 → 5.90.10)

Patch version with bug fixes.

```bash
npm install @tanstack/react-query@latest
npm test
```

**Benefits:**
- Bug fixes for data fetching
- Performance improvements
- Better TypeScript types

**Testing Checklist:**
- [ ] Master roster queries work correctly
- [ ] Saved games queries function properly
- [ ] Season/tournament data fetching works
- [ ] Cache invalidation works as expected
- [ ] All tests pass
- [ ] Production build succeeds

---

## Phase 3: Jest Ecosystem Upgrade (P2) ✅ COMPLETE

**Completed:** December 4, 2025 (PR #97)
**Time Spent:** ~1.5 hours

### Jest 30 Upgrade ✅ COMPLETE

**Before → After:**
- jest: 29.7.0 → 30.2.0
- jest-environment-jsdom: 29.7.0 → 30.2.0
- ts-jest: 29.3.2 → 29.4.4

**Results:**
- [x] All 1,694 tests pass
- [x] Component tests work correctly
- [x] Hook tests function properly
- [x] No new console warnings/errors
- [x] Memory leak detection still works
- [x] One test fix: `global-error.test.tsx` updated for jsdom 26 URL behavior

### react-i18next v16 Update ✅ COMPLETE

**Before → After:**
- i18next: 24.2.3 → 25.7.1
- react-i18next: 15.4.1 → 16.3.5

**Results:**
- [x] English translations work correctly
- [x] Finnish translations work correctly
- [x] Language switching functions properly
- [x] No `<Trans>` component usage (N/A)
- [x] TypeScript types compile without errors

### Next.js Security Fix ✅ COMPLETE (Bonus)

- next: 15.3.5 → 15.5.7 (CVE-2025-66478 / CVE-2025-55182 - RCE vulnerability fixed)

---

## Phase 4: Major Updates (P3 - After Refactoring Complete)

**Estimated Time:** 2-3 days
**Risk:** 🔴 HIGH - Major breaking changes

### ⏸️ DEFER: Next.js 16 Upgrade

**Status:** WAIT UNTIL STEP 2.6 REFACTORING COMPLETE

**Current:** Next.js 15.5.4
**Target:** Next.js 16.0.1
**Release Date:** October 21, 2025

**Why Defer?***
- You're 95% done with useGameOrchestration refactoring (~12 hours remaining)
- Next.js 16 has major architectural changes requiring extensive testing
- Testing will be 3x easier with smaller, focused hooks (≤600 lines each)
- Current Next.js 15.5.4 is stable and fully supported

**Breaking Changes:**
- Turbopack is now default bundler
- `next lint` command deprecated → Must use `eslint` directly
  - Update: `"lint": "next lint"` → `"lint": "eslint ."`
  - Must generate explicit `eslint.config.mjs`
- middleware.ts → proxy.ts migration
- New caching model with PPR
- React Compiler now stable

**Action Plan (After Refactoring):**

1. **Preparation:**
   - [ ] Read upgrade guide: https://nextjs.org/blog/next-16
   - [ ] Review middleware.ts usage
   - [ ] Plan lint configuration migration
   - [ ] Create backup branch

2. **Update Commands:**
```bash
npm install next@16 eslint-config-next@16
```

3. **Configuration Updates:**
   - [ ] Update package.json lint script
   - [ ] Generate eslint.config.mjs
   - [ ] Migrate middleware.ts → proxy.ts (if applicable)
   - [ ] Test Turbopack compatibility
   - [ ] Review caching configuration

4. **Testing Checklist:**
   - [ ] Development server starts correctly
   - [ ] All pages render properly
   - [ ] Production build succeeds
   - [ ] PWA functionality works
   - [ ] Service worker updates correctly
   - [ ] IndexedDB operations function
   - [ ] All routes accessible
   - [ ] API routes work (if any)
   - [ ] Full test suite passes
   - [ ] E2E tests pass
   - [ ] Performance metrics acceptable

**Benefits:**
- 5-10x faster Fast Refresh
- 2-5x faster builds
- React Compiler support
- Modern caching model
- Better developer experience

### Optional: recharts v3 Upgrade

**Current:** 2.15.4
**Target:** 3.4.1

**Status:** Only upgrade if needed or encountering issues

```bash
npm install recharts@3
# Test all chart components thoroughly
```

**Testing Required:**
- [ ] Game statistics charts render correctly
- [ ] Player performance charts work
- [ ] Tournament charts display properly
- [ ] Chart interactions function
- [ ] No console errors/warnings

---

## Deprecated Dependencies Analysis

### Status: ✅ NO ACTION REQUIRED

All deprecation warnings are from **transitive dependencies** in testing tools. They don't affect production builds and will be resolved automatically when parent packages update.

**Deprecated Packages (All Transitive):**
- `glob@7.x` (4 instances) - via rimraf and testing tools
- `inflight@1.0.6` - via glob@7.x
- `abab` - via jsdom
- `domexception` - via jsdom

**Impact:** Testing environment only, not in production bundle
**Priority:** LOW - Will be resolved by parent package updates

---

## Security Audit Summary

### Current Status

**Known Vulnerabilities:** 1 (xlsx package)
**Severity:** HIGH
**Action Required:** Yes (Phase 1)

**After Phase 1 Completion:**
- Expected vulnerabilities: 0
- All production dependencies secure
- Dev dependencies secure

### Regular Security Maintenance

```bash
# Run monthly
npm audit
npm audit fix  # For automatic fixes
npm outdated   # Check for updates
```

---

## Dependency Health Metrics

### Production Dependencies (17 total)

| Status | Count | Packages |
|--------|-------|----------|
| ✅ Up to date | 12 | react, react-dom, next, tailwindcss, etc. |
| ⚠️ Security issue | 1 | xlsx (P0 fix required) |
| 📦 Minor update available | 2 | @sentry/nextjs, @tanstack/react-query |
| 🔄 Major update available | 2 | react-i18next, recharts (optional) |

### Development Dependencies (23 total)

| Status | Count | Packages |
|--------|-------|----------|
| ✅ Up to date | 20 | TypeScript, ESLint, Playwright, etc. |
| 🔄 Major update available | 3 | jest, ts-jest, jest-environment-jsdom |

### Overall Health: ✅ GOOD

- Modern stack (React 19, Next.js 15, TypeScript 5)
- Well-maintained packages
- No unused dependencies
- No peer dependency conflicts
- Active maintenance from package authors

---

## Installation Commands Reference

### Phase 1 (P0 - Critical)
```bash
npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
npm test
npm run build
```

### Phase 2 (P1 - High Priority)
```bash
npm install @sentry/nextjs@latest @tanstack/react-query@latest
npm test
npm run build
npm run lint
```

### Phase 3 (P2 - Medium Priority)
```bash
# Jest ecosystem
npm install --save-dev jest@30 ts-jest@30 jest-environment-jsdom@30
npm test

# i18n
npm install react-i18next@latest
npm test
```

### Phase 4 (P3 - After Refactoring)
```bash
# Next.js 16 (read upgrade guide first!)
npm install next@16 eslint-config-next@16
# Update lint config
# Migrate middleware → proxy
# Test extensively

# recharts (optional)
npm install recharts@3
# Test all charts
```

---

## Testing Strategy

### After Each Update

```bash
# 1. Run tests
npm test

# 2. Run linting
npm run lint

# 3. Type check
npx tsc --noEmit

# 4. Build production
npm run build

# 5. E2E tests (if applicable)
npm run test:e2e

# 6. Manual testing
npm run dev
# Test core functionality in browser
```

### Update Order (Lowest Risk First)

1. ✅ Patch versions (5.90.2 → 5.90.10)
2. ✅ Minor versions - Sentry (10.12.0 → 10.28.0) DONE
3. 🔴 Major versions (29.7.0 → 30.0.5)

### Batch Related Updates

- Update Jest packages together (jest + ts-jest + jest-environment-jsdom)
- Update Next.js + eslint-config-next together
- Update i18next + react-i18next together

---

## Risk Assessment Matrix

| Priority | Update | Risk Level | Effort | Benefit | Urgency |
|----------|--------|------------|--------|---------|---------|
| **P0** | xlsx security fix | 🔴 HIGH | 30min | Security | IMMEDIATE |
| **P1** | Sentry update | 🟢 LOW | 1hr | Features/fixes | This week |
| **P1** | React Query update | 🟢 LOW | 30min | Bug fixes | This week |
| **P2** | Jest 30 upgrade | 🟡 MEDIUM | 2-4hr | +20% speed | This month |
| **P2** | react-i18next v16 | 🟢 LOW | 1-2hr | React 19 fixes | This month |
| **P3** | Next.js 16 | 🔴 HIGH | 2-3d | Major features | After refactor |
| **P3** | recharts v3 | 🟡 MEDIUM | 2-4hr | Optional | As needed |

---

## Success Criteria

### Phase 1 Complete When: ✅ DONE (2025-12-03, PR #96)
- [x] xlsx updated to latest secure version (pinned to 0.20.3)
- [x] No security vulnerabilities in `npm audit`
- [x] Excel export functionality verified working (24 tests passing)
- [x] All tests pass (1615 tests)
- [x] Production build succeeds

### Phase 2 Complete When: ✅ DONE (2025-12-03, PR #96)
- [x] Sentry and React Query updated (@sentry/nextjs 10.28.0, @tanstack/react-query 5.90.11)
- [x] All tests pass
- [x] Production build succeeds
- [x] No regression in functionality
- [x] No new console warnings/errors

### Phase 3 Complete When: ✅ ALL DONE (December 4, 2025)
- [x] Jest 30 and react-i18next 16 installed
- [x] All 1,694 tests pass
- [x] i18n functionality working correctly
- [x] No TypeScript errors
- [x] Next.js security fix applied (15.5.7)

### Phase 4 Complete When:
- [ ] Next.js 16 and eslint-config-next 16 installed
- [ ] Lint configuration migrated
- [ ] middleware.ts migrated to proxy.ts (if needed)
- [ ] All tests pass
- [ ] Production build succeeds
- [ ] Full manual testing complete
- [ ] Performance metrics acceptable or improved

---

## Rollback Plan

If any update causes issues:

```bash
# 1. Restore package.json and package-lock.json from git
git checkout package.json package-lock.json

# 2. Reinstall dependencies
npm install

# 3. Verify functionality
npm test
npm run build

# 4. Document the issue
# Add notes to this file about what went wrong
```

**Prevention:**
- Commit before each phase
- Test thoroughly after each update
- Keep detailed notes of any issues
- Update one package at a time for major versions

---

## Maintenance Schedule

### Monthly
- [ ] Run `npm outdated`
- [ ] Run `npm audit`
- [ ] Review for patch/minor updates
- [ ] Update low-risk packages

### Quarterly
- [ ] Review major version updates
- [ ] Plan migration for breaking changes
- [ ] Update documentation
- [ ] Evaluate new dependencies

### Before Major Features
- [ ] Ensure all dependencies up to date
- [ ] Fix any known vulnerabilities
- [ ] Run full test suite
- [ ] Document dependency state

---

## Notes and Observations

### Positive Findings
- ✅ React 19 + Next.js 15 + TypeScript 5 = Modern, current stack
- ✅ All major dependencies actively maintained
- ✅ No unused dependencies cluttering package.json
- ✅ No peer dependency conflicts
- ✅ Test infrastructure solid (Jest, Playwright, Testing Library)
- ✅ Good separation of dev vs production dependencies

### Areas for Improvement
- ⚠️ xlsx package from CDN (not npm registry) - acceptable for SheetJS
- 📦 Some minor/patch updates available - normal maintenance
- 🔄 Jest 30 available with performance improvements - worthwhile upgrade

### Coordination with Refactoring

**Current Refactoring Status:** 95% complete (Step 2.6 in progress)

**Recommendation:**
- ✅ Do Phase 1-2 now (security + minor updates)
- ⚠️ Do Phase 3 this month (Jest 30, low risk)
- ⏸️ Defer Phase 4 until refactoring 100% complete (Next.js 16)

**Reasoning:**
- Security fixes can't wait
- Minor updates are low risk
- Jest 30 improves test performance (helpful for refactoring)
- Next.js 16 is major update requiring extensive testing
- Smaller hooks (≤600 lines) = 3x easier to test major framework updates

---

## Related Documentation

- [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) - Current refactoring progress
- [CRITICAL_FIXES_TRACKER.md](../CRITICAL_FIXES_TRACKER.md) - Overall fix tracking
- [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) - Architecture overview
- [package.json](../../package.json) - Current dependencies

---

## Changelog

**2025-11-18:** Initial dependency analysis and update plan created
- Identified 1 critical security issue (xlsx)
- Documented 4 phases of updates
- Recommended deferring Next.js 16 until refactoring complete
- Established testing strategy and success criteria
