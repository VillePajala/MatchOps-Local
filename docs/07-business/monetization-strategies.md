# MatchOps Monetization Strategy

**Status:** Authoritative (canonical monetization reference)
**Last Updated:** February 2026

---

## Executive Summary

MatchOps launches **completely free** to maximize adoption and build reputation. Monetization is introduced later only if needed to cover infrastructure costs.

**Primary Goal:** Build user base and portfolio value, not immediate revenue.

---

## Strategy: Free Launch → Optional Paid Later

### Phase 1: Launch (Current)

| Tier | Price | Features |
|------|-------|----------|
| Local | Free | Full app, all features, data in browser |
| Cloud | Free | Backup + sync (while on Supabase free tier) |

**Rationale:**
- Zero friction for adoption
- Coaches already juggle MyClub + Taso — MatchOps must prove value before asking for money
- Amateur youth coaches (primary target) are price-sensitive
- Portfolio/reputation value exceeds potential subscription revenue
- Finnish market is small (~€500/month max realistic revenue)

### Phase 2: If Supabase Limits Reached (~400+ users)

**Option A: Pay Infrastructure Yourself**
- €25/month for Supabase Pro (personal expense, no business needed)
- Keeps app completely free
- Sustainable if app provides career/portfolio value

**Option B: Introduce Cloud Subscription**

| Tier | Price | Features |
|------|-------|----------|
| Local | Free | Full app, all features, browser storage only |
| Cloud | €12/year | Cloud backup + multi-device sync |

**Why €12/year:**
- €1/month equivalent — trivial for Finnish users
- 25 paying users = €300/year = Supabase Pro covered
- Low enough to not be a barrier
- Yearly = less churn than monthly

**Transition approach:**
- Grandfather existing cloud users (free forever, or 1 year free)
- New users choose: local (free) or cloud (€12/year)

### Phase 3: Future Premium Features (Optional)

If traction justifies it, add premium features:

| Feature | Price | Notes |
|---------|-------|-------|
| Advanced Stats Pack | €9.99 once | Season trends, player development |
| Export Pack | €4.99 once | PDF reports, Excel export |
| AI Coach Pack | €14.99 once | Lineup suggestions, insights |

Or bundle into higher subscription tier:
- Cloud Pro: €29/year (sync + stats + exports)

---

## Business Registration

**No registration needed if:**
- App is free
- You pay infrastructure costs personally (outgoing, not incoming money)

**Toiminimi required if:**
- Any user payments (even €1)
- Sponsorship income
- Club/B2B deals

**Toiminimi basics (Finland):**
- Free to register at ytj.fi
- Income added to personal tax return
- Minimal overhead for small amounts (<€5000/year)
- Can be dormant when not earning

---

## Target Market Analysis

### Primary: Amateur Youth Coaches (Finland)

| Characteristic | Implication |
|----------------|-------------|
| Volunteer/part-time | Price sensitive, paying out-of-pocket |
| Already use MyClub + Taso | MatchOps is additional tool, not replacement |
| Mostly phone-only | "Sync" less compelling; "backup" more compelling |
| Seasonal with breaks | Monthly subscription feels wasteful |
| Finnish purchasing power | €12/year is acceptable |

### Secondary: Semi-Pro / Academy Coaches

- May have club budget
- Higher willingness to pay
- Want advanced features
- Potential for club deals later

---

## Competitive Position

| Competitor | Model | MatchOps Advantage |
|------------|-------|-------------------|
| Paper/clipboard | Free | Digital, searchable, stats |
| Spreadsheets | Free | Purpose-built UX |
| MyClub Coach | Free (club-provided) | Focused on in-game, not admin |
| Generic coaching apps | $5-15/month | Local-first, privacy, Finnish |

**Positioning:** "The free, privacy-first coaching app for Finnish youth soccer."

---

## Infrastructure Costs

| Service | Free Tier Limit | Paid Tier | When You'd Hit |
|---------|-----------------|-----------|----------------|
| Supabase | 500 MB, 50K MAU | €25/month | ~400 users |
| Vercel | 100 GB bandwidth | €20/month | ~1000+ users |
| Sentry | 5K errors/month | €26/month | Unlikely |

**Realistic cost:**
- 0-400 users: €0/month
- 400-1000 users: €25/month
- 1000+ users: €45-70/month

---

## Value Beyond Revenue

### Portfolio Asset

- "Built an app used by 200+ Finnish coaches" > "Built an app"
- Demonstrates: shipping, user research, maintenance, iteration
- Visible in Finnish football community

### Opportunity Magnet

Potential outcomes:
- Job opportunities (sports tech companies)
- Freelance/consulting leads
- Palloliitto partnership
- Club consulting gigs
- Integration contracts (MyClub, Taso)
- Speaking at coaching seminars
- Acquisition interest

### Visibility Strategy

| Channel | Action |
|---------|--------|
| Word of mouth | Make it excellent, coaches tell coaches |
| Coaching communities | Palloliitto forums, Facebook groups |
| LinkedIn | "Building in public" dev content |
| Finnish dev communities | Koodiklinikka, meetups |
| Coaching courses | Demo at FA certifications |

---

## Decision Framework

```
Launch free (Phase 1)
         │
         ▼
┌─────────────────────────┐
│ Hit Supabase free limit │
│     (~400 users)        │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    ▼               ▼
Pay €25/mo      Add €12/year
yourself        cloud tier
    │               │
    ▼               ▼
Stay free      Need toiminimi
forever        (register business)
```

---

## Anti-Goals

Things we're explicitly NOT optimizing for:

- ❌ Maximizing short-term revenue
- ❌ Complex subscription tiers
- ❌ Feature gating that hurts UX
- ❌ Enterprise/B2B sales (for now)
- ❌ Competing with MyClub/Taso (complement, don't replace)

---

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Active users | 100+ | 6 months |
| User retention | 50%+ monthly active | Ongoing |
| Word-of-mouth referrals | Primary growth channel | Ongoing |
| Portfolio mentions | Include in job applications | Ongoing |
| Infrastructure cost coverage | Self-sustaining if monetized | 12+ months |

---

## Summary

1. **Launch completely free** — maximize adoption, zero friction
2. **Register toiminimi now** — free, takes 10 minutes, ready when needed
3. **Focus on quality and users** — build reputation
4. **Monitor Supabase usage** — act when approaching limits
5. **If monetizing:** €12/year cloud sync, grandfather existing users
6. **Future:** Add premium feature packs if demand exists

**Philosophy:** This is a portfolio piece first, a product second. The best outcome is opportunities it creates, not subscription revenue.
