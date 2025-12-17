# Infrastructure & Architecture Map

**Created**: December 17, 2025
**Owner**: Ville Pajala

---

## Company & Product Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           VELOMO AI                                      │
│                        (Company / Toiminimi)                             │
│                                                                          │
│   Owner: Ville Pajala                                                    │
│   Location: Helsinki, Finland                                            │
│   Y-tunnus: [Pending - Register Jan 2, 2026]                            │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         MATCHOPS                                 │   │
│   │                    (Product / PWA App)                           │   │
│   │                                                                  │   │
│   │   • Soccer coaching app                                          │   │
│   │   • Local-first PWA (offline capable)                           │   │
│   │   • Free tier + Premium ($9.99 one-time)                        │   │
│   │   • Available on Google Play Store (TWA)                        │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   [Future Products...]                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Domain & DNS Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          NAMECHEAP                                       │
│                      (Domain Registrar)                                  │
│                                                                          │
│   Domains Owned:                                                         │
│   • match-ops.com     (~$12/year, auto-renewal)                         │
│   • velomoai.com      (~$12/year, auto-renewal)                         │
│                                                                          │
│   WhoisGuard: Enabled (privacy protection)                              │
│                                                                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    Nameservers point to
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE                                       │
│                    (DNS & Email Routing)                                 │
│                                                                          │
│   ┌─────────────────────────────┐   ┌─────────────────────────────┐    │
│   │      match-ops.com          │   │      velomoai.com           │    │
│   │                             │   │                             │    │
│   │  DNS Records:               │   │  DNS Records:               │    │
│   │  • A → Vercel               │   │  • A → Vercel               │    │
│   │  • CNAME www → Vercel       │   │  • CNAME www → Vercel       │    │
│   │  • MX → Cloudflare Email    │   │  • MX → Cloudflare Email    │    │
│   │                             │   │                             │    │
│   │  Email Routing:             │   │  Email Routing:             │    │
│   │  • support@ → Gmail         │   │  • alerts@ → Gmail          │    │
│   │  • hello@ → Gmail           │   │  • dev@ → Gmail             │    │
│   │                             │   │  • hello@ → Gmail           │    │
│   └─────────────────────────────┘   └─────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Hosting & Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GITHUB                                         │
│                      (Source Control)                                    │
│                                                                          │
│   Repositories:                                                          │
│   • VillePajala/MatchOps-Local     → match-ops.com (product)            │
│   • VillePajala/velomoai-website   → velomoai.com (company site)        │
│                                                                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                         Auto-deploy on push
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           VERCEL                                         │
│                    (Hosting & Deployment)                                │
│                                                                          │
│   Projects:                                                              │
│   ┌─────────────────────────────┐   ┌─────────────────────────────┐    │
│   │     matchops-local          │   │    velomoai-website         │    │
│   │                             │   │                             │    │
│   │  Domain: match-ops.com      │   │  Domain: velomoai.com       │    │
│   │  Framework: Next.js 16      │   │  Framework: Next.js 16      │    │
│   │  Plan: Hobby (Free)         │   │  Plan: Hobby (Free)         │    │
│   │                             │   │                             │    │
│   │  Environment:               │   │  Environment:               │    │
│   │  • Production (master)      │   │  • Production (main)        │    │
│   │  • Preview (branches)       │   │                             │    │
│   └─────────────────────────────┘   └─────────────────────────────┘    │
│                                                                          │
│   Environment Variables:                                                 │
│   • SENTRY_AUTH_TOKEN                                                   │
│   • NEXT_PUBLIC_SENTRY_DSN                                              │
│   • GOOGLE_SERVICE_ACCOUNT_KEY (future - Play Billing)                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## App Distribution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      GOOGLE PLAY STORE                                   │
│                    (Android Distribution)                                │
│                                                                          │
│   App: MatchOps                                                          │
│   Package: app.matchops.local                                            │
│   Type: TWA (Trusted Web Activity)                                       │
│   Status: Internal Testing                                               │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    BUBBLEWRAP                                    │   │
│   │              (TWA Build Tool - Local)                            │   │
│   │                                                                  │   │
│   │   Wraps PWA (match-ops.com) into Android APK/AAB                │   │
│   │   Config: /AnotherProjects/AnotherProjects/AnotherProjects/     │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │           AnotherProjects/AnotherProjects/AnotherProjects/      │   │
│   │                                                                  │   │
│   │   Key files:                                                     │   │
│   │   • twa-manifest.json                                           │   │
│   │   • assetlinks.json (in PWA public/.well-known/)                │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   Monetization (Pending P4C/P4D):                                       │
│   • Product: matchops_premium ($9.99 one-time)                          │
│   • API: Digital Goods API + Payment Request API                        │
│   • Verification: /api/billing/verify endpoint                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB / PWA                                      │
│                    (Direct Web Access)                                   │
│                                                                          │
│   URL: https://match-ops.com                                            │
│   Install: Add to Home Screen (iOS/Android/Desktop)                     │
│   Offline: Full offline capability via Service Worker                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Email Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INBOUND EMAIL                                    │
└─────────────────────────────────────────────────────────────────────────┘

    External Sender
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│  support@match-ops  │      │  alerts@velomoai    │
│  hello@match-ops    │      │  dev@velomoai       │
│                     │      │  hello@velomoai     │
└──────────┬──────────┘      └──────────┬──────────┘
           │                            │
           └──────────┬─────────────────┘
                      │
                      ▼
           ┌─────────────────────┐
           │  CLOUDFLARE EMAIL   │
           │      ROUTING        │
           └──────────┬──────────┘
                      │
                      ▼
           ┌─────────────────────┐
           │       GMAIL         │
           │  (Personal Inbox)   │
           │                     │
           │  Labels:            │
           │  • MatchOps         │
           │  • Velomo/Alerts    │
           │  • Velomo/Developer │
           └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        OUTBOUND EMAIL                                    │
└─────────────────────────────────────────────────────────────────────────┘

    Reply from Gmail (personal address)

    Note: To send AS support@match-ops.com, would need:
    • Brevo SMTP (free tier) - not yet configured
    • Gmail "Send As" setup
```

---

## Monitoring & Error Tracking

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SENTRY                                         │
│                    (Error Monitoring)                                    │
│                                                                          │
│   Organization: [Your Sentry Org]                                       │
│   Project: MatchOps                                                      │
│                                                                          │
│   Notifications → alerts@velomoai.com → Gmail                           │
│                                                                          │
│   Config Files:                                                          │
│   • src/instrumentation-client.ts                                       │
│   • sentry.server.config.ts                                             │
│   • sentry.edge.config.ts                                               │
│   • src/app/global-error.tsx                                            │
│                                                                          │
│   Settings:                                                              │
│   • Production only (unless FORCE_ENABLE)                               │
│   • 10% trace sampling                                                  │
│   • Browser noise filtered                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Social Media & Public Presence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       PUBLIC PRESENCE                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│      WEBSITES       │  │    SOCIAL MEDIA     │  │    APP STORES       │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│                     │  │                     │  │                     │
│  match-ops.com      │  │  LinkedIn:          │  │  Google Play:       │
│  (Product)          │  │  Velomo AI          │  │  MatchOps           │
│                     │  │  (Company Page)     │  │  (Internal Testing) │
│  velomoai.com       │  │                     │  │                     │
│  (Company)          │  │  X/Twitter:         │  │  Apple App Store:   │
│                     │  │  Personal account   │  │  Not planned        │
│                     │  │  (promotes product) │  │                     │
│                     │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MATCHOPS TECH STACK                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Frontend:                                                              │
│   • Next.js 16.0.7 (App Router)                                         │
│   • React 19.2                                                          │
│   • TypeScript                                                          │
│   • Tailwind CSS 4                                                      │
│                                                                          │
│   Data:                                                                  │
│   • IndexedDB (local storage)                                           │
│   • React Query (state management)                                      │
│   • No backend database                                                 │
│                                                                          │
│   PWA:                                                                   │
│   • Custom Service Worker (public/sw.js)                                │
│   • Dynamic manifest generation                                         │
│   • Offline-first architecture                                          │
│                                                                          │
│   i18n:                                                                  │
│   • i18next                                                             │
│   • Languages: English, Finnish                                         │
│                                                                          │
│   Testing:                                                               │
│   • Jest 30                                                             │
│   • React Testing Library                                               │
│   • 2,600+ tests                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Summary

| Service | Provider | Cost | Billing |
|---------|----------|------|---------|
| match-ops.com domain | Namecheap | ~$12/year | Annual |
| velomoai.com domain | Namecheap | ~$12/year | Annual |
| DNS & Email Routing | Cloudflare | Free | - |
| Hosting (both sites) | Vercel | Free | - |
| Error Monitoring | Sentry | Free tier | - |
| Source Control | GitHub | Free | - |
| Play Store | Google | $25 one-time | - |

**Total Recurring: ~$24/year**

---

## Account Credentials (Store in Password Manager)

| Service | Account | Purpose |
|---------|---------|---------|
| Namecheap | [email] | Domain registrar |
| Cloudflare | [email] | DNS, email routing |
| Vercel | [email] | Hosting |
| GitHub | VillePajala | Source control |
| Google Play Console | [email] | App distribution |
| Sentry | [email] | Error monitoring |
| LinkedIn | Velomo AI | Company page |

---

## Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                              USER                                        │
│                                │                                         │
│              ┌─────────────────┼─────────────────┐                      │
│              │                 │                 │                      │
│              ▼                 ▼                 ▼                      │
│     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                │
│     │  Web (PWA)  │   │ Play Store  │   │   Direct    │                │
│     │match-ops.com│   │   (TWA)     │   │   Install   │                │
│     └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                │
│            │                 │                 │                        │
│            └─────────────────┼─────────────────┘                        │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                  │
│                    │   MATCHOPS APP  │                                  │
│                    │                 │                                  │
│                    │  ┌───────────┐  │                                  │
│                    │  │ IndexedDB │  │  ← All data stored locally      │
│                    │  │  (Local)  │  │                                  │
│                    │  └───────────┘  │                                  │
│                    │                 │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│           ┌─────────────────┼─────────────────┐                        │
│           │                 │                 │                        │
│           ▼                 ▼                 ▼                        │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │
│   │   Sentry    │   │ Play Billing│   │    PWA      │                 │
│   │  (Errors)   │   │ (Payments)  │   │  Updates    │                 │
│   │             │   │  [Future]   │   │             │                 │
│   └─────────────┘   └─────────────┘   └─────────────┘                 │
│                                                                          │
│   Note: App is LOCAL-FIRST. No user data leaves the device.            │
│   Only error reports (opt-in) and payments go to external services.    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference Links

| Resource | URL |
|----------|-----|
| Product Website | https://match-ops.com |
| Company Website | https://velomoai.com |
| GitHub (Product) | https://github.com/VillePajala/MatchOps-Local |
| Play Console | https://play.google.com/console |
| Vercel Dashboard | https://vercel.com/dashboard |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Sentry Dashboard | https://sentry.io |
| Namecheap | https://namecheap.com |

---

## Related Documentation

- [Communication Infrastructure Plan](./communication-infrastructure-plan.md)
- [Play Store Implementation Plan](../03-active-plans/PLAY-STORE-IMPLEMENTATION-PLAN.md)
- [Play Billing Implementation](../04-features/play-billing-implementation.md)
- [Unified Roadmap](../03-active-plans/UNIFIED-ROADMAP.md)
