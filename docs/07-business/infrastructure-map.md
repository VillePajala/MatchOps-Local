# Infrastructure & Architecture Map

**Created**: December 17, 2025
**Last Updated**: November 20, 2026
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
│   │   • Soccer & futsal coaching app                                 │   │
│   │   • Local-first PWA (offline capable)                           │   │
│   │   • Free (monetization parked; billing code exists, off)         │   │
│   │   • Live on Google Play (TWA, cloud-only: sign-in required)     │   │
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
│   │  • support@ → owner Gmail   │   │  • alerts@ → Gmail          │    │
│   │  • hello@ → owner Gmail     │   │  • dev@ → Gmail             │    │
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
│   • VillePajala/MatchOps-Local     → app.match-ops.com (app, repo root) │
│                                      + match-ops.com (site, site/)      │
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
│   │  match-ops-local (app)      │   │    velomoai-website         │    │
│   │                             │   │                             │    │
│   │  Domain: app.match-ops.com  │   │  Domain: velomoai.com       │    │
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
│   • NEXT_PUBLIC_SUPABASE_URL                                            │
│   • NEXT_PUBLIC_SUPABASE_ANON_KEY                                       │
│   • GOOGLE_SERVICE_ACCOUNT_KEY (future - Play Billing)                  │
│                                                                          │
│   Marketing site: project match-ops-hub (repo site/ folder)             │
│   → www.match-ops.com (match-ops.com redirects to www)                  │
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
│   Package: com.matchops.local                                            │
│   Type: TWA (Trusted Web Activity) wrapping app.match-ops.com           │
│   Status: Production (released 2026-06-09); current 1.0.9 (versionCode  │
│           20), live 2026-11-20. Cloud-only: users must sign in.         │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    BUBBLEWRAP                                    │   │
│   │              (TWA Build Tool - Local)                            │   │
│   │                                                                  │   │
│   │   Wraps PWA (match-ops.com) into Android APK/AAB                │   │
│   │   Build steps: docs/05-development/twa-build-guide.md           │   │
│   │                                                                  │   │
│   │   Key files:                                                     │   │
│   │   • twa-manifest.json                                           │   │
│   │   • assetlinks.json (in PWA public/.well-known/)                │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   Monetization: PARKED - app is free (PREMIUM_ENFORCEMENT_ENABLED=false)│
│   • Product: matchops_premium_monthly (not sold)                        │
│   • API: Digital Goods API + Payment Request API                        │
│   • Verification: Edge Function (verify-subscription)                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB / PWA                                      │
│                    (Direct Web Access)                                   │
│                                                                          │
│   URL: https://app.match-ops.com                                        │
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
           │ (owner's personal   │
           │  inbox)             │
           │                     │
           │  Labels:            │
           │  • MatchOps         │
           │  • Velomo/Alerts    │
           │  • Velomo/Developer │
           └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        OUTBOUND EMAIL                                    │
└─────────────────────────────────────────────────────────────────────────┘

    Auth Emails (automated):
    ┌─────────────────────┐
    │   SUPABASE AUTH     │
    │  (OTP, pwd reset)   │
    │         │           │
    │         ▼           │
    │   RESEND SMTP       │
    │  smtp.resend.com    │
    │         │           │
    │         ▼           │
    │  noreply@auth.      │
    │  match-ops.com      │
    └─────────────────────┘

    Business Emails:
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
│  (Product site)     │  │  Velomo AI          │  │  MatchOps           │
│                     │  │  (Company Page)     │  │  (Production)       │
│  velomoai.com       │  │                     │  │                     │
│  (Company)          │  │  X/Twitter:         │  │  Apple App Store:   │
│                     │  │  Personal account   │  │  Not planned        │
│                     │  │  (promotes product) │  │                     │
│                     │  │                     │  │                     │
│                     │  │  YouTube: MatchOps  │  │                     │
│                     │  │  (set up 2026-11-20)│  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

**YouTube channel** (set up 2026-11-20): base name (English) "MatchOps – Soccer & futsal app for coaches", Finnish translation "MatchOps – Jalkapallo- ja futsalvalmentajille". Playlists "Start here" / "Aloita tästä". Videos: the "hero" and "basic" videos, each in Finnish and English. Background music is licensed from Envato (licence HK2RXGA9YT); Content ID claims on the videos have to be disputed with that licence.

---

## Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MATCHOPS TECH STACK                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Frontend:                                                              │
│   • Next.js 16 (App Router)                                              │
│   • React 19.2                                                          │
│   • TypeScript                                                          │
│   • Tailwind CSS 4                                                      │
│                                                                          │
│   Data:                                                                  │
│   • IndexedDB (local storage)                                           │
│   • Supabase PostgreSQL (cloud mode)                                    │
│   • React Query (state management)                                      │
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
│   • ~7,700 tests                                                        │
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
| Auth transactional email | Resend | Free (3k/mo) | - |
| Cloud backend (auth, DB, edge functions) | Supabase | Free tier (staging + production) | - |
| Hosting (both sites) | Vercel | Free | - |
| Error Monitoring | Sentry | Free tier | - |
| Source Control | GitHub | Free | - |
| Play Store | Google | $25 one-time | - |
| YouTube channel | Google | Free | - |
| Video music licence | Envato | Licence HK2RXGA9YT | - |

**Total Recurring: ~$24/year** (Supabase and Resend free tiers sufficient for early launch; scale as needed)

---

## Account Credentials (Store in Password Manager)

| Service | Account | Purpose |
|---------|---------|---------|
| Namecheap | [email] | Domain registrar |
| Cloudflare | [email] | DNS, email routing |
| Resend | [email] | Auth transactional emails (Supabase SMTP) |
| Supabase | [email] | Cloud backend (auth, database, edge functions) |
| Vercel | [email] | Hosting |
| GitHub | VillePajala | Source control |
| Google Play Console | [email] | App distribution |
| Sentry | [email] | Error monitoring |
| LinkedIn | Velomo AI | Company page |
| YouTube | [Google account] | MatchOps channel |

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
│     │app.match-ops│   │   (TWA)     │   │   Install   │                │
│     └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                │
│            │                 │                 │                        │
│            └─────────────────┼─────────────────┘                        │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                  │
│                    │   MATCHOPS APP  │                                  │
│                    │                 │                                  │
│                    │  ┌───────────┐  │                                  │
│                    │  │ IndexedDB │  │  ← Data stored locally           │
│                    │  │  (Local)  │  │    (default mode)                │
│                    │  └───────────┘  │                                  │
│                    │                 │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│       ┌─────────────┬──────┼──────┬─────────────┐                      │
│       │             │      │      │             │                      │
│       ▼             ▼      ▼      ▼             ▼                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Sentry   │ │ Supabase │ │ Supabase │ │ Play     │ │  PWA     │    │
│  │ (Errors) │ │   Auth   │ │   DB     │ │ Billing  │ │ Updates  │    │
│  │          │ │ (Cloud)  │ │ (Cloud)  │ │ [Parked] │ │          │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                          │
│   Note: App is LOCAL-FIRST (IndexedDB first, background sync). The    │
│   Play build is cloud-only: data syncs to Supabase (EU). Error reports │
│   go to Sentry unless the user turns the diagnostics switch off.       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference Links

| Resource | URL |
|----------|-----|
| Product Website | https://match-ops.com |
| App | https://app.match-ops.com |
| Company Website | https://velomoai.com |
| GitHub (Product) | https://github.com/VillePajala/MatchOps-Local |
| Play Console | https://play.google.com/console |
| Vercel Dashboard | https://vercel.com/dashboard |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Sentry Dashboard | https://sentry.io |
| Namecheap | https://namecheap.com |

---

## Related Documentation

- [Communication Infrastructure Plan](../08-archived/completed-active-plans/communication-infrastructure-plan.md) (archived)
- [Play Store Implementation Plan](../08-archived/completed-active-plans/PLAY-STORE-IMPLEMENTATION-PLAN.md) (archived)
- [Play Billing Implementation](../04-features/play-billing-implementation.md)
- [Unified Roadmap](../03-active-plans/UNIFIED-ROADMAP.md)
