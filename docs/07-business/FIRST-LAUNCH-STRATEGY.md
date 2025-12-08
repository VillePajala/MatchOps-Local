# First Launch Monetization Strategy

**Status**: Active Strategy
**Last Updated**: December 2024

> This document outlines the practical, minimal-complexity monetization approach for MatchOps-Local's first Play Store launch. For comprehensive strategy options, see [monetization-strategies.md](./monetization-strategies.md).

---

## Philosophy: Ship Simple, Iterate Later

For a first app launch, prioritize:
1. **Getting to market** over perfect monetization
2. **Learning from users** over assumptions
3. **Simple implementation** over complex features
4. **Moving to next projects** over over-engineering

---

## Recommended Model: Quantity Limits + One-Time Purchase

### Why Quantity Limits (Not Feature Gating)

| Approach | User Experience | Implementation |
|----------|-----------------|----------------|
| **Feature gating** | "I can't see what this does" | Complex UI, feature flags |
| **Quantity limits** | "I see full value, need more capacity" | Simple count checks |

**Quantity limits are better because:**
- Users experience **everything** the app can do
- They get **invested** in the workflow before hitting limits
- Upgrade happens at a **natural moment** (need more capacity)
- Implementation is **much simpler** (just count checks)

### Recommended Limits

| Resource | Free | Premium ($9.99) |
|----------|------|-----------------|
| **Teams** | 1 | Unlimited |
| **Players per team** | 12-15 | Unlimited |
| **Saved games** | 10-20 | Unlimited |
| **Seasons** | 1 | Unlimited |

**Why these numbers:**
- **1 team**: Coach tries with main team, needs upgrade for second team
- **12-15 players**: Starting lineup + few subs, but real teams have 18-25
- **10-20 games**: Half a season worth, then they're hooked
- **1 season**: Can track current season, upgrade for history

### All Features Stay Free

| Feature | Status | Rationale |
|---------|--------|-----------|
| PDF/Excel export | Free | They'll export their 1 team anyway |
| Statistics/Analytics | Free | Shows value, makes them want more data |
| Tactics board | Free | Core experience |
| Backup/restore | Free | Don't punish data protection |
| Timer/scoring | Free | Core functionality |

**All roads lead to:** "I need more teams/players/games" → Upgrade

---

## Pricing

### One-Time Purchase: $9.99

**Why one-time, not subscription:**
- Aligns with local-first, "install once" philosophy
- Lower barrier for coaches (no recurring cost concern)
- Simpler Play Store integration
- No subscription management complexity

**Why $9.99:**
- Low enough for impulse purchase
- High enough to signal quality
- Can increase later if conversion is strong
- Standard mobile app price point

---

## Promo Codes / Free Access

### Implementation: Local Unlock Codes

```typescript
const UNLOCK_CODES = {
  'BETA2024': { expires: '2025-06-01' },
  'REVIEWER': { expires: '2025-12-31' },
  'FRIEND': { expires: null }, // Never expires
};
```

**Use cases:**
- Beta testers
- App reviewers
- Friends and family
- Promotional giveaways

### Why Unlimited Local Codes Are Acceptable

Since MatchOps is local-first with **no backend**, there's no way to track redemptions across devices. Each device stores its own unlock status.

**Risk assessment:**
- Soccer coaching is a small niche
- Code sharing forums won't care about this app
- If codes leak → rotate them in next app update
- If 100 people use a leaked code → you got 100 potential word-of-mouth users

**If leaking becomes a real problem** (good problem to have!), add a simple validation endpoint later.

### Settings UI

```
┌─────────────────────────────┐
│  Settings                   │
│                             │
│  [Have a promo code?]       │
│  ________________________   │
│  |                      |   │
│  └──────────────────────┘   │
│  [ Apply ]                  │
└─────────────────────────────┘
```

---

## Revenue Projections (Realistic)

### Year 1-2 Scenarios

| Scenario | Effort Level | Year 1 | Year 2 | Cumulative |
|----------|--------------|--------|--------|------------|
| **A: Publish & Wait** | Minimal | $360 | $800 | $1,160 |
| **B: Active Engagement** | Regular updates, ASO, forums | $1,500 | $3,600 | $5,100 |
| **C: Growth Focus** | Marketing, partnerships | $4,800 | $16,000 | $20,800 |

### Assumptions

**Scenario A (Minimal):**
- 1,200 downloads/year → 2,000/year
- 3-4% conversion rate
- No marketing effort

**Scenario B (Realistic Goal):**
- 3,000 downloads/year → 6,000/year
- 5-6% conversion rate
- Regular updates, respond to reviews, soccer forum presence

**Scenario C (Optimistic):**
- 8,000 downloads/year → 20,000/year
- 6-8% conversion rate
- Content marketing, coaching community partnerships

### Seasonality

Soccer seasons drive downloads:
- **High**: August-November (fall season), March-May (spring season)
- **Low**: December-February, June-July

Plan marketing around season starts.

---

## Implementation Checklist

### Minimal Viable Monetization (~1 day)

- [ ] Define limit constants (teams, players, games, seasons)
- [ ] Add count checks at creation points
- [ ] Implement Play Billing for $9.99 unlock
- [ ] Add upgrade prompt when limit hit
- [ ] Add promo code input in Settings
- [ ] Test purchase flow end-to-end

### Upgrade Prompt UI

```
┌─────────────────────────────────────┐
│  You've reached the free limit      │
│                                     │
│  Free: 1 team, 15 players           │
│  Pro:  Unlimited teams & players    │
│                                     │
│  Your data is safe — upgrade to     │
│  continue building your roster.     │
│                                     │
│  [ Upgrade $9.99 ]  [ Maybe Later ] │
└─────────────────────────────────────┘
```

**Key messaging:** "Your data is safe" — reassures them their investment isn't lost.

---

## Post-Launch: Passive Maintenance Mode

After launch, maintain with minimal time investment:

| Task | Frequency | Time |
|------|-----------|------|
| Check Play Store reviews | Weekly | 10 min |
| Reply to feedback emails | Weekly | 15 min |
| Bug fixes (if critical) | As needed | 1-2 hrs |
| Feature updates | Quarterly | 1 day |

**Target:** ~2 hours/month to keep app alive while building other projects.

---

## What Drives Conversions

| Factor | Impact | Action |
|--------|--------|--------|
| **Reviews (4.5+ stars)** | 2-3x downloads | Ask beta testers for reviews |
| **ASO (keywords)** | +50% visibility | "soccer coach app", "football lineup" |
| **Screenshots** | +30% conversion | Show key features |
| **Localization** | 2x market size | EN/FI done, consider ES/DE |
| **Seasonal timing** | 2-3x spike | Launch before Aug or Mar |
| **Coaching forums** | Targeted users | Reddit, Facebook groups |

---

## Collecting Feature Requests

Feature requests tell you what people will pay for.

### Methods (in priority order)

1. **Email link in Settings** (5 min setup)
   ```
   mailto:feedback@matchops.app?subject=MatchOps%20Feedback
   ```

2. **Play Store reviews** (automatic)
   - Check weekly, reply to all reviews

3. **Simple form** (Tally.so, Google Forms)
   - Link from Settings → "Request a Feature"

4. **In-app prompt after limit hit**
   ```
   "What would make you upgrade?"
   [ ] More teams
   [ ] Better stats
   [ ] Other: ____
   ```

   This is **gold** — tells you exactly what to build next.

---

## Insights Loop at Upgrade Prompt

When users hit a limit and choose "Maybe Later":

```
┌─────────────────────────────────────┐
│  What would make Pro worth it?      │
│                                     │
│  [ ] More teams                     │
│  [ ] More players per team          │
│  [ ] More saved games               │
│  [ ] Better statistics              │
│  [ ] Other: _______________         │
│                                     │
│  [ Submit ]  [ Skip ]               │
└─────────────────────────────────────┘
```

Store responses locally, review periodically to guide development.

---

## Summary

| Decision | Recommendation |
|----------|----------------|
| **Model** | Quantity limits + One-time purchase |
| **Price** | $9.99 (can raise later) |
| **Free tier** | 1 team, 12-15 players, 10-20 games, 1 season |
| **Premium** | Unlimited everything |
| **Free access** | Local unlock codes |
| **Timeline** | Implement in ~1 day, then launch |
| **Post-launch** | ~2 hours/month maintenance |

**Goal:** Ship, learn, move on to next projects.

---

## Related Documents

- [monetization-strategies.md](./monetization-strategies.md) — Comprehensive strategy options
- [PRIVACY_FIRST_MONETIZATION.md](./PRIVACY_FIRST_MONETIZATION.md) — Privacy-compatible approach
- [paywall-implementation.md](./paywall-implementation.md) — Detailed technical implementation
- [FUTURE-VISION.md](./FUTURE-VISION.md) — Long-term product vision (CoachHub)
