# Security Guidelines

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

### CSP Headers Configuration
Implemented via Next.js security headers to prevent XSS attacks and unauthorized resource loading.

### Allowed Sources
- **Scripts**: Self-hosted and trusted CDNs only
- **Styles**: Self-hosted with safe inline styles (hashed)
- **Images**: Self + data: URIs for PWA icons
- **Connect**: API endpoints and Sentry only
- **Fonts**: Self-hosted fonts only

## Data Protection

### Client-Side Data Handling
- All game data stored in localStorage (offline-first)
- No sensitive user data collected
- Optional parent email in error reports only

### Error Reporting Security
- Error messages sanitized before sending to Sentry
- No sensitive localStorage data in error reports
- User emails only collected with explicit consent

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