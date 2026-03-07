# MatchOps Monetization Strategy

**Status:** Authoritative (canonical monetization reference)
**Last Updated:** March 2026

---

## Executive Summary

MatchOps uses a **generous freemium model** with entity-based limits. The app is fully functional for free with limits on competitions (seasons and tournaments). A one-time purchase unlocks unlimited usage. The goal is to **cover infrastructure costs**, not maximize revenue.

**Primary Goal:** Cover cloud infrastructure costs with minimal friction to adoption.

---

## Phase 1: Launch (Current Target)

### Model: Generous Free Tier + One-Time Purchase

| Resource | Free | Full Version |
|----------|------|-------------|
| Teams | Unlimited | -- |
| Players | Unlimited | -- |
| Games | Unlimited | -- |
| Seasons | 3 | Unlimited |
| Tournaments | 3 | Unlimited |
| Features | All | -- |
| Cloud Sync | Included | -- |

**Full Version Price:** One-time purchase, approximately 4.99-6.99 EUR (final price TBD based on Play Store market research).

### Why These Limits

**Design principle:** Limits must only trigger AFTER a coach has seen the value and invested effort to learn the app.

A typical coach's journey:
1. Downloads app, creates account (forced on Android TWA)
2. Adds players, creates team(s)
3. Tracks first games -- learns the UI, field mode, events
4. Creates a season or tournament to organize games
5. Uses it for a full competition -- sees stats, the value
6. Wants to continue -- creates more competitions

**Why 3 seasons + 3 tournaments:**
- Covers a full year+ of coaching (e.g., fall season + spring season + summer tournament)
- By the time a coach needs competition #4, they have proven commitment
- The ask for ~5 EUR after 3 competitions is fair and obvious
- Natural upgrade moment at season boundaries, never mid-game or mid-season

**Why teams and players are unlimited:**
- In youth football, coaches often need separate teams per competition for the same age group
- Limiting teams would hit coaches immediately during normal setup
- Roster size shouldn't be gated -- teams have as many players as they have
- Teams without competitions are just roster containers with minimal cost

**The "free forever" path:**
- A coach CAN use the app without seasons/tournaments -- just games with players
- This gives a basic experience but misses organized stats, trends, filtering
- This is intentionally generous, not a loophole
- These users cost almost nothing and may convert later

### No Surprises Principle (Critical)

Users must NEVER be surprised by the upgrade prompt. The free tier limits are communicated **early and often**, well before the user hits them:

1. **Play Store listing**: App description mentions "3 free competitions included"
2. **Competition list UI**: Shows usage indicator (e.g., "2 of 3 free seasons")
3. **Last free competition**: When creating competition #3, a subtle note says "This is your last free season"
4. **At the limit**: When creating #4, a clear upgrade prompt with purchase option

By the time a coach sees the upgrade prompt, they've been informed at least 2-3 times. The prompt feels like a natural next step, not a trap.

### Upgrade UX

- Upgrade prompt appears when creating competition #4 (season or tournament)
- Prompt is **non-blocking for existing data** -- all existing games, stats, exports remain accessible
- The user simply cannot create NEW competitions beyond the limit
- Prompt explains: "You've used all 3 free seasons. Unlock unlimited for EUR X."
- No recurring payments, no subscription anxiety
- One purchase = unlocked forever

### Platform Behavior

| Platform | Account | Limits | Purchase |
|----------|---------|--------|----------|
| Android (Play Store TWA) | Required (cloud mode forced) | Enforced | Google Play Billing (Digital Goods API) |
| Browser (desktop/mobile) | Optional (local mode available) | Enforced in cloud mode only | Not available (use Android to purchase) |
| Local mode (browser) | Not required | NOT enforced (always "premium") | N/A |

**Note:** Local-mode users have no limits. This is intentional -- local mode has zero server cost, and these users may eventually migrate to cloud mode and convert.

---

## Phase 2: Growth (Hundreds of Active Users)

### Potential: "MatchOps Pro" Annual Subscription (~9.99 EUR/year)

Only introduce if there is genuine demand for advanced features that cost more to provide:

| Feature | Description |
|---------|-------------|
| Advanced analytics | Season-over-season trends, player development curves |
| Auto-generated reports | PDF match reports, season summaries for parents/clubs |
| Practice planning (advanced) | If practice module gets built out |

**Rules for Phase 2:**
- Phase 1 (one-time purchase) buyers are grandfathered -- they keep unlimited competitions forever
- Pro adds NEW value on top, never takes away what people already paid for
- Only introduce when the features are actually built and valuable
- Annual pricing to match coaching cycles (not monthly)

### Revenue Math

- 50 one-time purchases x 5 EUR = 250 EUR (one-time)
- 20 Pro subscribers x 10 EUR/year = 200 EUR/year
- Combined: covers Supabase Pro (300 EUR/year) comfortably

---

## Phase 3: Club Tier (If Clubs Come Knocking)

### Potential: "MatchOps Club" (~29-99 EUR/month)

This is a fundamentally different product for organizations:

| Feature | Description |
|---------|-------------|
| Multi-coach access | Club admin assigns coaches, sees all teams |
| Shared player database | Players move between age groups seamlessly |
| Club-wide analytics | Dashboard across all teams and age groups |
| Data ownership | Club owns data, not individual coaches |
| Branding | Club logo and colors in the app |

**Why this tier works:**
- Serving an organization, not an individual -- different willingness to pay
- Infrastructure costs are higher (more data, more users per account)
- Clubs spend more on cones than 50 EUR/month -- budget is not the issue
- Clear value proposition: centralized player development tracking

**Rules for Phase 3:**
- Individual coaches remain on Phase 1/2 pricing -- club tier is additive
- Only build if there is actual demand (inbound interest from clubs)
- Requires significant backend work (multi-tenant, permissions, admin UI)

---

## Monetization Principles (Non-Negotiable)

### What We Always Do
- New money comes from NEW value, not from restricting existing value
- Grandfather existing paying users when pricing changes
- Keep local mode free and unlimited (zero server cost)
- All features available in free tier (limits are on quantity, not capability)
- Upgrade prompts at natural boundaries (season creation), never mid-action
- Existing data is always accessible regardless of tier

### What We Never Do
- Retroactively limit what free/paid users already have
- Move existing features behind a higher paywall
- Hold customer data hostage (data export always available)
- Block core functionality (game tracking, field mode, events)
- Show ads
- Sell user data

---

## Business Registration

**Toiminimi required** for any user payments (even 1 EUR):
- Free to register at ytj.fi
- Income added to personal tax return
- Minimal overhead for small amounts (<5000 EUR/year)
- Can be dormant when not earning
- Must be registered before enabling Play Store billing

---

## Target Market Analysis

### Primary: Amateur Youth Coaches (Finland)

| Characteristic | Implication |
|----------------|-------------|
| Volunteer/part-time | Price sensitive, paying out-of-pocket |
| Already use MyClub + Taso | MatchOps is additional tool, not replacement |
| Mostly phone-only | Cloud sync is the default experience |
| Seasonal with breaks | One-time purchase avoids "paying for nothing" feeling |
| Finnish purchasing power | 5 EUR one-time is trivial |

### Secondary: Semi-Pro / Academy Coaches

- May have club budget for tools
- Higher willingness to pay
- Want advanced features (Phase 2 target)
- Potential bridge to club tier (Phase 3)

---

## Competitive Landscape

### Direct Competitors (Coaching Tools)

| Competitor | What It Does | Model | Price | MatchOps Advantage |
|------------|-------------|-------|-------|-------------------|
| Paper/clipboard | Manual tracking | Free | Free | Digital, searchable, stats |
| Spreadsheets (Excel/Sheets) | Manual data entry | Free | Free | Purpose-built UX, real-time |
| Tactical Pad | Tactical board only | One-time | 5-10 EUR | Full game tracking + board |
| TacticBoard Soccer | Tactical board only | Free + ads / IAP | 3-5 EUR | No ads, comprehensive |

### Adjacent Competitors (Team Management)

| Competitor | What It Does | Model | Price | Why Not a Threat |
|------------|-------------|-------|-------|-----------------|
| TeamSnap | Scheduling, messaging, payments | Subscription | 10-15 USD/mo | Admin tool, not game tracking |
| Heja | Team communication | Free (club partnerships) | Free | Communication, not coaching |
| TeamLinkt | Registration, scheduling | Freemium | 5-8 USD/mo | Admin focus |
| MyClub (Finland) | Club management | Club-provided | Free to coaches | Administrative, not in-game |

### Premium Competitors (Analytics/Video)

| Competitor | What It Does | Model | Price | Why Different Market |
|------------|-------------|-------|-------|---------------------|
| Hudl | Video analysis | Subscription | 100-200 USD/mo | High school+ level, video focus |
| Veo | AI video recording | Hardware + sub | 2000+ EUR + sub | Hardware required, professional |
| Metrica Sports | Professional analytics | Enterprise | Custom | Professional clubs only |
| StatsBomb | Advanced data analytics | Enterprise | Custom | Elite football only |
| PlayersTek | GPS tracking | Hardware + sub | Hardware + sub | Requires wearables |

### MatchOps Market Position

**Gap in the market:** No tool offers real-time game tracking + tactical board + stats + roster management for individual youth coaches at an accessible price point. The closest alternative is a clipboard and post-game spreadsheet entry.

**Positioning:** "The affordable, privacy-first coaching app for youth football."

**Competitive moat:**
- Offline-first (works at any pitch, any conditions)
- Local-first privacy (data on device by default)
- Real-time game tracking (not post-game data entry)
- Combined tactical + tracking + stats (not just one feature)
- Finnish localization and context (leagues, tournament structures)
- One-time purchase in a market of monthly subscriptions

---

## Infrastructure Costs

| Service | Free Tier Limit | Paid Tier | When Triggered |
|---------|-----------------|-----------|----------------|
| Supabase | 500 MB DB, 50K MAU | 25 USD/month (Pro) | ~400 active cloud users |
| Vercel | 100 GB bandwidth | 20 USD/month (Pro) | ~1000+ users |
| Sentry | 5K errors/month | 26 USD/month | Unlikely at this scale |
| Domain | N/A | ~10 EUR/year | Always |
| Resend (email) | 100/day free | 20 USD/month | ~2000+ signups/month |

**Realistic cost trajectory:**

| Users | Monthly Cost | Revenue Needed |
|-------|-------------|----------------|
| 0-400 | ~1 EUR/mo (domain only) | None |
| 400-1000 | ~25 EUR/mo (Supabase Pro) | ~5 one-time purchases |
| 1000+ | ~45-70 EUR/mo | ~10-15 one-time purchases |

**Break-even:** ~60-90 total one-time purchases covers a full year of infrastructure at the 1000-user scale. This is very achievable if the app provides real value.

---

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Active users | 100+ | 6 months post-launch |
| Free-to-paid conversion | 5-10% | Ongoing |
| User retention | 50%+ monthly active | Ongoing |
| Infrastructure cost coverage | Self-sustaining | 12+ months |
| Support requests | Manageable (< 5/week) | Ongoing |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Feb 2026 | Originally planned free launch, monetize later | Maximize adoption first |
| Mar 2026 | Changed to generous freemium from day one | Better to have billing infrastructure ready; retrofitting is harder |
| Mar 2026 | Entity limits (seasons/tournaments) over feature gating | Limits trigger after proven value; features stay complete for all users |
| Mar 2026 | One-time purchase over subscription | No subscription fatigue; coaches shouldn't pay for months they don't coach |
| Mar 2026 | Teams/players/games unlimited | Teams are needed per-competition in youth football; limiting them hits coaches during normal setup |

---

## Summary

1. **Launch with generous freemium** -- 3 seasons + 3 tournaments free, one-time ~5 EUR for unlimited
2. **Register toiminimi** before enabling Play Store billing
3. **Focus on quality and adoption** -- free tier IS the full app
4. **Monitor usage** -- only upgrade infrastructure when needed
5. **Phase 2/3 only if demand exists** -- don't build billing complexity prematurely
6. **Never punish existing users** -- grandfather, don't restrict
