# Release Readiness Checklist (Final Pass)

Purpose: one‑page go/no‑go checklist aggregating acceptance criteria from the authoritative plans.

Status: Authoritative (living)

---

## Security & Headers
- [ ] Security headers present on all routes (CSP, Permissions‑Policy, Referrer‑Policy, X‑Content‑Type‑Options, HSTS where applicable)
- [ ] No unexpected CSP violations in console during normal flows

## Service Worker & PWA
- [ ] SW caches only intended static assets; HTML is network‑first with sensible fallback
- [ ] Old caches cleaned on activation; cache name is versioned
- [ ] Update flow works via banner; no stale content after update/refresh
- [ ] Manifest verified (name, icons, theme, scope, orientation); PWA installable (Lighthouse pass)

## Observability
- [ ] Sentry initialized; errors captured with environment/release tags
- [ ] Logging via `logger`; no stray `console.*` in production code paths

## Testing
- [ ] Jest unit/integration tests pass (local and CI)
- [ ] Core E2E path(s) pass (local and CI); flakes addressed
- [ ] Accessibility smoke (jest‑axe) shows no critical issues on key screens

## Packaging & Store
- [ ] TWA builds successfully; Digital Asset Links configured (if applicable)
- [ ] Store listing assets ready (icons, screenshots, feature graphics)
- [ ] Privacy Policy and Terms links available and accurate

## Post‑Launch
- [ ] CI audit passes (no critical prod vulnerabilities)
- [ ] Staged rollout plan set; monitoring alerts configured
- [ ] Support/triage process agreed (BUG_FIX_PLAN.md, SECURITY_UPDATE_PLAN.md)

