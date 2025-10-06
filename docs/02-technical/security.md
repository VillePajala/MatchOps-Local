# Security Guidelines

Status: Authoritative (current state + planned changes)

## Local-First Security Model

### Architecture Context

MatchOps-Local is a **local-first Progressive Web App** with a fundamentally different threat model than traditional web applications:

**What This Means for Security:**
- ✅ **Primary defense**: Browser sandboxing and origin isolation
- ✅ **Data-at-rest**: Protected by OS disk encryption
- ✅ **Attack surface**: Limited to XSS, malicious PWA updates
- ❌ **NOT defending against**: Network attacks, SQL injection, multi-user exploits
- ❌ **NO sensitive data**: Game scores and player names (not PII, financial, or health data)

**Network Communication:**
- **PWA updates**: Standard HTTPS (handled by browser)
- **License validation**: Play Store API (HTTPS, managed by Google)
- **Error reporting**: Sentry (opt-in, HTTPS)
- **User game data**: NEVER transmitted

### Security Priorities

1. **XSS Prevention** (High Priority)
   - CSP headers to block unauthorized scripts
   - No `eval()` or dangerous dynamic code
   - Input sanitization for user-entered data (player names, team names)

2. **PWA Security** (High Priority)
   - Service Worker integrity checks
   - Secure update mechanism
   - Manifest validation

3. **License Protection** (Medium Priority)
   - Play Store purchase verification
   - Local license caching (tamper detection)
   - Offline grace period for license checks

4. **Data Integrity** (Medium Priority)
   - IndexedDB corruption recovery
   - Backup/restore functionality
   - Version migration safety

**NOT Security Concerns for This App:**
- ❌ API authentication/authorization (no backend)
- ❌ Data encryption at rest (browser sandboxing + OS encryption sufficient)
- ❌ Network security hardening (minimal network communication)
- ❌ Multi-user access control (single-user app)
- ❌ GDPR compliance logging (no user data transmitted)

## Environment Variable Security

### Critical Security Rules

1. **Never commit secrets to the repository**
   - Use `.env.local` for local development secrets
   - Use deployment platform environment variables for production
   - Server-side only variables must NOT have `NEXT_PUBLIC_` prefix

2. **Sentry DSN Configuration**
   ```bash
   # ✅ CORRECT - Public DSN (safe to expose in client)
   NEXT_PUBLIC_SENTRY_DSN=https://[PUBLIC_KEY]@[SENTRY_HOST]/[PROJECT_ID]
   
   # ❌ WRONG - Never expose auth tokens
   SENTRY_AUTH_TOKEN=your_secret_token  # Server-side only!
   ```

3. **Environment Variable Validation**
   - All `NEXT_PUBLIC_*` variables are exposed to the client
   - Server-side variables without `NEXT_PUBLIC_` prefix are secure
   - Use environment validation to catch misconfigurations

### Sentry Security Best Practices

1. **DSN vs Auth Token**
   - **Sentry DSN** (NEXT_PUBLIC_SENTRY_DSN): Safe for client exposure - only allows sending events
   - **Auth Token** (SENTRY_AUTH_TOKEN): Server-only - allows API access, source map uploads

2. **Environment-Specific Configuration**
   ```bash
   # Development
   NEXT_PUBLIC_SENTRY_DSN=https://dev-key@sentry.io/dev-project
   
   # Production  
   NEXT_PUBLIC_SENTRY_DSN=https://prod-key@sentry.io/prod-project
   SENTRY_AUTH_TOKEN=secret_token_for_builds  # Server-side only!
   ```

3. **Additional Sentry Security**
   - Use different projects for dev/staging/production
   - Rotate auth tokens regularly
   - Limit auth token permissions to minimum required

## Content Security Policy (CSP)

### Current Status
- CSP headers are planned but not yet enabled in `next.config.ts`.
- Implementation is tracked in PRODUCTION_READINESS_FIX_PLAN.md §1 and sequenced as Phase P1 in MASTER_EXECUTION_GUIDE.md.

### CSP Headers Configuration (Planned)
Will be implemented via Next.js security headers to prevent XSS and unauthorized resource loading.

### Allowed Sources (Target Policy for Local-First PWA)

**Appropriate CSP for our architecture:**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';  # Next.js requirements
style-src 'self' 'unsafe-inline';                  # Tailwind CSS
img-src 'self' data: blob:;                        # PWA icons
font-src 'self' data:;                             # Fonts
connect-src 'self'
  https://*.sentry.io                               # Error reporting (opt-in)
  https://play.google.com                           # License validation
  https://www.googleapis.com;                       # Play Store API
manifest-src 'self';                               # PWA manifest
worker-src 'self';                                 # Service Worker
frame-ancestors 'none';                            # No embedding
```

**What we DON'T need** (over-engineering for local-first):
- ❌ Complex nonce/hash generation (adds complexity for minimal XSS gain)
- ❌ Strict `script-src` without unsafe-inline (Next.js requires it)
- ❌ Multiple CDN domains (all assets self-hosted)
- ❌ API security rules (no backend APIs)

Note: Demo files under `public/demos/` may reference external fonts (Google Fonts) and are not part of the production app. Exclude demo paths from CSP validation or only allow during development.

## Data Protection

### Client-Side Data Handling
- All game data stored locally via the storage abstraction (localStorage backend today; IndexedDB support planned/available depending on configuration)
- **Data never transmitted**: Game scores, player names, statistics stay on device
- No sensitive user data collected (no PII, financial, or health data)
- Optional email in error reports only (explicit consent required)

### Privacy-First Data Policy
- **What stays local**: Game data, scores, player rosters, team configurations
- **What's transmitted**: License status checks, error reports (opt-in), PWA updates
- **No behavioral tracking**: Feature usage, user patterns, or analytics NOT collected
- **User data ownership**: Complete control, export capability, no cloud lock-in

### Error Reporting Security
- Error messages sanitized before sending to Sentry
- No game data (scores, players) in error reports
- User emails only collected with explicit consent
- Error reporting can be completely disabled by user

## Build Security

### Source Map Protection
- Source maps only uploaded to Sentry (not exposed publicly)
- Build-time environment validation
- Secret environment variables never in client bundles

### Dependencies
- Regular security audits with npm audit
- Automated dependency updates via CI
- No known vulnerabilities in production builds

## Deployment Security Checklist

### Before Production Deployment
- [ ] Sentry DSN configured for production project
- [ ] SENTRY_AUTH_TOKEN set as server-side only variable
- [ ] CSP headers configured and tested
- [ ] Environment variables validated
- [ ] No secrets in client bundle (verify with build inspection)
- [ ] Security audit passed (npm audit)

### Regular Security Maintenance
- [ ] Monitor Sentry for security-related errors
- [ ] Review CSP violations in browser console
- [ ] Update dependencies monthly
- [ ] Rotate Sentry auth tokens quarterly
- [ ] Review environment variable exposure

## Incident Response

### If Secrets are Exposed
1. Immediately revoke exposed tokens/keys
2. Remove from git history if committed
3. Generate new credentials
4. Update all deployment environments
5. Review access logs for unauthorized usage

### Reporting Security Issues
- Create GitHub security advisory for vulnerabilities
- Contact team leads for access-related issues
- Document security incidents for future prevention
