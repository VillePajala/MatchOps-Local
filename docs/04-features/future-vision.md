# Future Features (Dream Concepts)

> ## ⚠️ Read this before building anything below (added 2026-09-17)
>
> This document was written before much of the app existed and has not been kept in
> step with it. Everything below is still listed as a dream, but some of it shipped
> and some of it has been overtaken. A sweep on 2026-09-17 checked every concept
> against the code; the results live in **UNIFIED-ROADMAP.md, "Ideas to explore"**.
> The three that matter most:
>
> **ALREADY BUILT** - do not build them twice. *Referee Quick Reference* is the Rules
> Directory. *Formation Templates* is the formation presets. *Opponent Database /
> Head-to-Head* is `utils/headToHead.ts`, a card in GameStats and an Excel sheet.
> *Voice Moments* is Kirjuri.
>
> **SETTLED BY EXPERIENCE** - *Quick Post-Game Ratings* and *Comparative Ranking*.
> This document's own Open Question #5 asks whether per-match rating is sustainable.
> It is not: assessments went off by default on 2026-09-09 because nobody kept them
> up. The question has an answer now.
>
> **CONTRADICTS A POSITION SINCE TAKEN** - the *Injury & Availability Tracker*. The
> app's AI consent copy tells coaches "Never dictate health, injuries, family
> matters." A tracker for children's injuries cannot be built without reopening that
> decision, and it is ranked #2 here, so it will be reached for first.
>
> The ideas that remain genuinely open and small are listed in the roadmap rather
> than re-derived from here.

**Status**: Vision / Not Planned
**Last Updated**: January 2026

This document captures potential AI-powered features that could enhance MatchOps-Local if integrated with Azure AI services. These are brainstorming ideas, not committed roadmap items.

---

## Architecture Overview

All AI features would route through Supabase Edge Functions to keep API keys server-side:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MatchOps-Local PWA                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                           │
│         (Proxy layer - keeps Azure keys server-side)                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Azure   │ │ Azure   │ │ Azure   │ │ Azure   │ │ Azure   │
   │ OpenAI  │ │ Vision  │ │ Speech  │ │ Language│ │ Document│
   │ GPT-4o  │ │         │ │         │ │         │ │ Intel   │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

**Key principle**: AI features would be premium add-ons. Local mode and basic cloud sync remain unaffected.

---

## Voice Features (Azure Speech + OpenAI)

### Sideline Voice Logging

**The Problem**: Coaches can't tap screens while watching the game.

**The Solution**: Speak naturally, AI logs the event.

```
Coach: "Goal, Matti, assist from Ville, 23 minutes"
         │
         ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ Speech-to-  │ ──▶ │ GPT-4o      │ ──▶ │ Game Event  │
   │ Text        │     │ Parse Intent│     │ Created     │
   └─────────────┘     └─────────────┘     └─────────────┘
```

**Parsed output**:
```json
{
  "type": "goal",
  "player": "Matti Virtanen",
  "assist": "Ville Korhonen",
  "time": 1380
}
```

**Features**:
- Fuzzy matching against current roster
- Handles natural time formats ("23 minutes", "end of first half")
- Supports Finnish and English
- Works with ambient noise (sideline environment)

**Azure Services**: Speech-to-Text, OpenAI GPT-4o

---

### Post-Match Voice Notes

**Use case**: Coach records verbal thoughts after match, searchable later.

**Flow**:
1. Coach taps "Add Voice Note" on game detail screen
2. Records 30-second to 5-minute voice memo
3. Azure transcribes to text
4. Text attached to game record
5. Searchable across all games ("find games where I mentioned set pieces")

**Azure Services**: Speech-to-Text

---

### Real-Time Match Narration (Dream Mode)

**Concept**: Coach wears earpiece, speaks naturally throughout match, all events logged automatically.

```
"Matti on for Ville... that's a corner... goal!"
                    │
                    ▼
         Real-time Speech-to-Text
         + Event Classification
                    │
                    ▼
         Game state updates automatically
```

**Challenges**: Requires continuous audio stream processing, high accuracy in noisy environment.

**Azure Services**: Speech-to-Text (real-time), OpenAI GPT-4o

---

## AI Coach Assistant (Azure OpenAI GPT-4o)

### Natural Language Queries

**Concept**: Ask questions about your data in plain language.

**Example queries**:
- "Show me players who score more in away games"
- "Who needs more playing time this season?"
- "Compare our first half vs second half performance"
- "Which opponent have we struggled against most?"
- "Find games where we conceded in the last 10 minutes"

**Architecture**:
1. User types/speaks question
2. GPT-4o generates query logic (not raw SQL—structured filter object)
3. App executes query against local/cloud data
4. Results displayed with explanation

**Azure Services**: OpenAI GPT-4o

---

### Match Report Generator

**Input**: Game data (events, stats, score, coach notes)

**Output**: Parent-friendly narrative report in Finnish or English

**Example output**:
> *"Joukkue pelasi tasaisen ottelun kotikentällä sunnuntaina. Matti Virtanen avasi maalinteon ensimmäisellä puoliajalla kauniilla laukauksella. Vastustaja tasoitti toisella jaksolla, mutta Ville Korhosen rangaistuspotku varmisti voiton. Koko joukkue pelasi aktiivisesti ja puolustus toimi hyvin."*

**Features**:
- Highlights key moments and standout players
- Appropriate tone for parent communication
- Bilingual (EN/FI) output
- Optionally includes stats summary

**Azure Services**: OpenAI GPT-4o

---

### Training Session Generator

**Input**:
- Focus area ("set pieces", "defensive shape", "passing")
- Duration (60/90/120 min)
- Age group (U10, U12, U15, etc.)
- Available equipment

**Output**: Structured training plan with:
- Warm-up drills
- Main exercises with diagrams
- Small-sided games
- Cool-down
- Time allocation for each section

**Azure Services**: OpenAI GPT-4o

---

### Tactical Suggestions

**Input**: "Opponent plays 4-3-3 with high press"

**Output**:
- Counter-formation suggestions
- Key matchup recommendations
- Set piece opportunities
- Risk areas to watch

**Azure Services**: OpenAI GPT-4o

---

### Player Development Insights

**Input**: Individual player's stats, assessments, playing time over season

**Output**:
- Strengths/weaknesses summary
- Development trajectory
- Suggested focus areas
- Comparison to age-appropriate benchmarks

**Azure Services**: OpenAI GPT-4o

---

## Vision Features (Azure Computer Vision)

### Whiteboard-to-Tactics

**Problem**: Coach draws on physical whiteboard during team talk, wants it digitized.

**Solution**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Photo of    │ ──▶ │ Azure       │ ──▶ │ Digital     │
│ whiteboard  │     │ Vision OCR  │     │ tactics     │
│ drawing     │     │ + GPT-4o    │     │ board       │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Features**:
- Detects player positions (X markers, jersey numbers)
- Recognizes movement arrows
- Converts to app's tactical drawing format
- Editable after import

**Azure Services**: Computer Vision, OpenAI GPT-4o

---

### Roster Import from Photo

**Use case**: Coach has printed roster or registration sheet.

**Flow**:
1. Take photo of document
2. Azure Document Intelligence extracts table data
3. Maps to player fields (name, number, position)
4. Coach reviews and confirms
5. Players added to pool

**Azure Services**: Document Intelligence

---

### Formation Detection from Match Photo

**Concept**: Upload match photo → detect player positions → suggest formation.

**Challenges**:
- Players in motion
- Camera angle variations
- Distinguishing teams by kit color

**Status**: Stretch goal / R&D

**Azure Services**: Computer Vision, Custom Vision (potentially)

---

## Language Features (Azure Language Services)

### Auto-Translation

**Scope**: All user-generated text content translatable EN ↔ FI

**Applies to**:
- Coach notes
- Assessment comments
- Match reports
- Training plans

**UX**: Toggle button to view content in other language

**Azure Services**: Translator

---

### Season Summarization

**Input**: 20+ games of detailed notes, stats, assessments

**Output**: Narrative season summary highlighting:
- Team progression
- Standout performers
- Areas of improvement
- Key moments
- Statistical trends

**Azure Services**: OpenAI GPT-4o (summarization)

---

### Sentiment Analysis on Coach Notes

**Concept**: Detect patterns in coach's own notes.

**Example alert**:
> "You've logged frustrated comments about Ville's attitude 3 times this month. Consider a conversation?"

**Privacy note**: All analysis local to user's data, not shared.

**Azure Services**: Language Service (sentiment analysis)

---

## Document Intelligence

### Tournament Schedule Import

**Input**: PDF of tournament schedule

**Output**: All games created with:
- Date/time
- Opponent
- Location
- Tournament association

**Azure Services**: Document Intelligence

---

### Registration Form Processing

**Input**: Scanned parent registration forms (consent forms, contact info)

**Output**: Player records with extracted data

**Privacy note**: Sensitive data handling required

**Azure Services**: Document Intelligence

---

## Pricing Model Concept

```
┌─────────────────────────────────────────────────────────────┐
│                    Pricing Tiers                             │
├─────────────────────────────────────────────────────────────┤
│  FREE (Local)     │ No AI features                          │
│  SYNC (€4.99/mo)  │ Cloud sync only, no AI                  │
│  PRO (€9.99/mo)   │ Cloud sync + AI features (usage capped) │
│  TEAM (€19.99/mo) │ Higher AI limits, priority processing   │
└─────────────────────────────────────────────────────────────┘
```

**Usage caps** (example for PRO tier):
- 100 voice transcriptions/month
- 50 AI queries/month
- 20 report generations/month
- Unlimited translation

---

## Implementation Priority (Hypothetical)

| Priority | Feature | Azure Service | Effort | Impact |
|----------|---------|---------------|--------|--------|
| 1 | Voice event logging | Speech + OpenAI | Medium | High |
| 2 | Match report generator | OpenAI | Low | High |
| 3 | Natural language queries | OpenAI | Medium | Medium |
| 4 | Auto-translation | Language | Low | Medium |
| 5 | Training session generator | OpenAI | Low | Medium |
| 6 | Post-match voice notes | Speech | Low | Medium |
| 7 | Whiteboard-to-tactics | Vision + OpenAI | High | Medium |
| 8 | Document import | Document Intelligence | Medium | Low |
| 9 | Season summarization | OpenAI | Low | Low |
| 10 | Real-time narration | Speech + OpenAI | High | High |

---

## Technical Considerations

### Latency
- Voice features need <2s response time to feel natural
- Batch features (reports, summaries) can tolerate 5-10s

### Offline Handling
- AI features require network (by definition)
- Clear UI indication when unavailable
- Queue requests for later? (complex)

### Cost Control
- Per-user monthly quotas
- Caching for repeated queries
- Batch processing where possible

### Privacy
- User data sent to Azure for processing
- Clear consent required
- Option to disable AI features entirely
- No training on user data (Azure commitment)

---

## Open Questions

1. **Voice accuracy**: How well does Azure Speech handle Finnish names in noisy sideline environment?
2. **Adoption**: Would coaches actually use voice features, or prefer tapping?
3. **Cost viability**: Can AI features be profitable at proposed price points?
4. **Competitive moat**: Are these features differentiating, or will all coaching apps have them?

---

## Related Documents

- [Dual-Backend Architecture](../02-technical/architecture/dual-backend-architecture.md)
- [Technology Decisions](../02-technical/technology-decisions.md)
- [Supabase Implementation Guide](../03-active-plans/supabase-implementation-guide.md)

---

---

# Hub & Spoke Architecture (Dream Concept)

## The Vision

A master hub where club admins manage teams and competitions, while individual coaches pull data to their apps and sync match results back.

```
                    ┌─────────────────────────────┐
                    │        MASTER HUB           │
                    │  (Club Admin / Manager)     │
                    │                             │
                    │  • Create teams & rosters   │
                    │  • Define competitions      │
                    │  • Schedule games           │
                    │  • View aggregated stats    │
                    │  • Cross-team analysis      │
                    └──────────────┬──────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │  Coach App      │   │  Coach App      │   │  Coach App      │
   │  (U10 Team)     │   │  (U12 Team)     │   │  (U15 Team)     │
   │                 │   │                 │   │                 │
   │  • Pull roster  │   │  • Pull roster  │   │  • Pull roster  │
   │  • Track games  │   │  • Track games  │   │  • Track games  │
   │  • Push stats   │   │  • Push stats   │   │  • Push stats   │
   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

**Benefits:**
- Reduces coach setup work (rosters come from hub)
- Enables cross-team/club-wide analysis
- Single source of truth for player identities
- Natural path to organizational pricing

---

## Technical Approaches

### Option 1: Multi-Tenant Supabase (Recommended)

Extend current Supabase schema with organization layer:

```sql
-- New tables
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL,  -- 'admin', 'manager', 'coach'
  team_ids UUID[],     -- which teams this coach can access
  UNIQUE(organization_id, user_id)
);

-- Modify existing tables
ALTER TABLE teams ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE players ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE games ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE games ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE games ADD COLUMN assigned_coach UUID REFERENCES auth.users(id);
```

**RLS Policies:**
```sql
-- Coaches can read org data they belong to
CREATE POLICY "Coaches read org teams"
  ON teams FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Coaches can only write to their assigned games
CREATE POLICY "Coaches update assigned games"
  ON games FOR UPDATE
  USING (assigned_coach = auth.uid());

-- Admins can do everything in their org
CREATE POLICY "Admins full access"
  ON teams FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Option 2: Separate Hub App + API

```
┌─────────────────────────────────────────────────────────────┐
│                    HUB APPLICATION                           │
│              (Separate Next.js app or dashboard)             │
│                                                              │
│  Supabase Project A (Hub Database)                          │
│  • organizations, teams, players, competitions              │
│  • scheduled_games (templates)                              │
│  • aggregated_stats (from coach submissions)                │
└─────────────────────────────────┬───────────────────────────┘
                              │
                         REST/GraphQL API
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    COACH APP (MatchOps-Local)                │
│                                                              │
│  • Local game tracking (current functionality)              │
│  • Sync endpoints to pull/push from hub                     │
└─────────────────────────────────────────────────────────────┘
```

### Option 3: Federation Model

Each coach keeps their own database. Hub queries coaches' data via API.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Coach A DB  │     │ Coach B DB  │     │ Coach C DB  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    Federation API
                           │
                    ┌──────┴──────┐
                    │   HUB       │
                    │ (Aggregator)│
                    └─────────────┘
```

**Pros:** Coach data sovereignty, works even if hub goes down
**Cons:** Complex, identity reconciliation nightmare

---

## Data Flow

```
Hub Admin                           Coach
    │                                 │
    │ Creates team "FC Honka U12"     │
    │ Adds players to roster          │
    │ Creates game vs "HJK U12"       │
    │ Assigns game to Coach Matti     │
    │                                 │
    │ ──────── Sync ─────────────────▶│
    │                                 │ Sees team, roster, scheduled game
    │                                 │ Tracks match (events, subs, stats)
    │                                 │
    │◀──────── Sync ───────────────── │
    │                                 │
    │ Sees match data in hub          │
    │ Aggregates across all teams     │
```

---

## Hard Problems & Solutions

### 1. Entity Identity

**Problem:** Is "Matti Virtanen" in Coach A's data the same as "M. Virtanen" in Coach B's?

| Approach | Pros | Cons |
|----------|------|------|
| **Hub-assigned IDs** | Clean, no ambiguity | Requires upfront setup |
| **Palloliitto TASO integration** | Canonical source | Dependency on external system |
| **Fuzzy matching + manual confirm** | Flexible | Labor intensive |

**Recommended:** Hub creates canonical player records with UUIDs. Coaches reference those IDs.

### 2. Conflict Resolution

**Problem:** Two coaches accidentally track the same game, or coach edits after admin locks results.

**Solution:** Game state machine
```
Game States:
  SCHEDULED → ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED → LOCKED
                │                          │
                │ Only assigned            │ Admin can
                │ coach can edit           │ request changes
```

### 3. Offline Sync

**Problem:** Coach tracks game offline, syncs later. What if hub data changed?

**Solution:** Optimistic locking with conflict detection
```typescript
POST /api/hub/games/{id}/results
Headers: {
  "If-Match": "etag-from-last-sync"
}

// If hub data changed:
409 Conflict
{
  "message": "Game was modified. Please review changes.",
  "hubVersion": {...},
  "yourVersion": {...}
}
```

### 4. Privacy & Permissions

| Role | Can See | Can Edit |
|------|---------|----------|
| **Org Admin** | All teams, all games, all stats | Everything |
| **Team Manager** | Their team(s), all games | Team roster, game assignments |
| **Coach** | Assigned team, assigned games | Game events during tracking |
| **Parent** (future) | Their child's stats only | Nothing |

---

## Changes to MatchOps-Local

```typescript
// New sync service
interface HubSyncService {
  pullAssignments(): Promise<{
    teams: Team[];
    players: Player[];
    games: ScheduledGame[];
  }>;

  submitGameResults(gameId: string, results: GameResults): Promise<void>;

  subscribeToAssignments(callback: (update) => void): Unsubscribe;
}

// Mode selection expands
type BackendMode =
  | 'local'           // Current: offline, single user
  | 'cloud'           // Current: Supabase, single user
  | 'hub-connected';  // New: Connected to organization hub
```

**UI Changes:**
- New "Organization" section in settings
- "Pull from Hub" button on team/game screens
- "Submit to Hub" button after game completion
- Sync status indicator

---

## Palloliitto TASO Integration (Dream Within Dream)

If Finnish Football Association exposed an API:

```
┌─────────────────┐
│  Palloliitto    │
│  TASO System    │
│                 │
│  • Official     │
│    player IDs   │
│  • Team         │
│    registrations│
│  • Competition  │
│    schedules    │
└────────┬────────┘
         │
         │ Official API (if it existed)
         │
         ▼
┌─────────────────┐
│  MatchOps Hub   │◀──── Coaches submit game data
│                 │
│  • Syncs teams  │────▶ Could feed back to TASO?
│  • Syncs players│
│  • Schedules    │
└─────────────────┘
```

This would solve identity problems completely - every player has official TASO ID.

---

## Implementation Phases (Hypothetical)

| Phase | Scope | Effort |
|-------|-------|--------|
| **1** | Organization & membership tables | 2 weeks |
| **2** | Admin dashboard (basic) - create teams, assign coaches | 3 weeks |
| **3** | Coach pull sync - teams, rosters, scheduled games | 2 weeks |
| **4** | Coach push sync - submit game results | 2 weeks |
| **5** | Aggregation views - cross-team stats in hub | 3 weeks |
| **6** | Advanced permissions & workflow | 2 weeks |
| **7** | Real-time sync (optional) | 2 weeks |

**Total:** ~4 months of focused work

---

## Pricing Model Concept

```
┌─────────────────────────────────────────────────────────────┐
│                    Pricing Tiers                             │
├─────────────────────────────────────────────────────────────┤
│  Individual Coach                                            │
│    FREE (Local)     │ Full features, single device          │
│    SYNC (€4.99/mo)  │ Cloud sync, cross-device              │
│    PRO (€9.99/mo)   │ + AI features                         │
├─────────────────────────────────────────────────────────────┤
│  Organization                                                │
│    CLUB (€49/mo)    │ Hub + 10 coach seats                  │
│    LEAGUE (€149/mo) │ Hub + 50 coach seats + API access     │
│    FEDERATION       │ Custom pricing                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Open Questions

1. **Build vs Partner:** Should we build hub, or integrate with existing club management systems?
2. **Scope creep:** Does hub turn us into a different product entirely?
3. **Market:** How many clubs actually want centralized data vs independent coaches?
4. **Competition:** How does this compare to existing club management software?

---

# Enhanced Game Data Capture (Dream Concept)

## The Problem

Goals and assists are terrible metrics for evaluating players:

| What Goals/Assists Capture | What They Miss |
|---------------------------|----------------|
| Final touch on scoring plays | Defensive excellence |
| | Build-up play contribution |
| | Work rate and pressing |
| | Positioning and shape |
| | Decision making quality |
| | Players who "do the dirty work" |
| | Goalkeeper distribution |
| | Recovery runs |

**A defender can have a perfect game and show 0 in every stat.**

---

## Design Constraints

1. **Coach is coaching** - Can't be heads-down logging during play
2. **Volunteer coaches** - Not professional analysts with time to review video
3. **Youth development focus** - Stats should encourage good behaviors, not just outcomes
4. **Must be faster than paper** - Or coaches won't use it

---

## Idea 1: Moment Capture (Tap-to-Log)

**Concept:** Don't track everything. Log notable moments as they happen.

```
┌─────────────────────────────────────────┐
│  MOMENT CAPTURE                          │
│                                          │
│  [🌟 Great Play] [⚽ Shot] [🛡️ Defense] │
│                                          │
│  [🔄 Lost Ball] [💪 Battle Won] [❌ Error]│
│                                          │
│  Last: 🛡️ Matti (12:34)                 │
│                                          │
└─────────────────────────────────────────┘
```

**Flow:**
1. Something notable happens
2. Coach taps category (1 tap)
3. Taps player (1 tap)
4. Done - 2 taps, <2 seconds

**After game:** Rich picture of who did what, when.

**Data captured:**
```json
{
  "moments": [
    { "time": 734, "player": "matti-id", "type": "defensive_win", "period": 1 },
    { "time": 891, "player": "ville-id", "type": "great_play", "period": 1 },
    { "time": 1203, "player": "matti-id", "type": "lost_ball", "period": 2 }
  ]
}
```

**Analysis possibilities:**
- Moments per player per game
- Positive/negative ratio
- Moment distribution across game (who fades?)
- Trends over season

---

## Idea 2: Quick Post-Game Ratings

**Concept:** 30-second per-player rating immediately after game while memory is fresh.

```
┌─────────────────────────────────────────┐
│  POST-GAME RATINGS                       │
│                                          │
│  Matti Virtanen (#10)                    │
│                                          │
│  Effort      [●●●●○] 4/5                │
│  Technique   [●●●○○] 3/5                │
│  Decisions   [●●●●●] 5/5                │
│  Impact      [●●●●○] 4/5                │
│                                          │
│  Quick note: ________________________   │
│                                          │
│  [← Prev]              [Next →]         │
└─────────────────────────────────────────┘
```

**Rating Dimensions:**

| Dimension | What it captures |
|-----------|------------------|
| **Effort/Work Rate** | Running, pressing, recovery runs |
| **Technique** | First touch, passing, control |
| **Decisions** | When to pass/shoot/dribble |
| **Positioning** | Being in right place |
| **Communication** | Talking, organizing |
| **Bravery** | Challenging, heading, tackles |
| **Impact** | Overall influence on game |

**Time:** ~3 minutes for 14-player squad

**Analysis:**
- Track dimension improvements over season
- Identify players strong in different areas
- Compare ratings to objective stats

---

## Idea 3: Comparative Ranking

**Concept:** Humans are better at relative judgments than absolute ratings.

```
┌─────────────────────────────────────────┐
│  TOP PERFORMERS TODAY                    │
│                                          │
│  Drag players to rank:                   │
│                                          │
│  🥇 [          Matti          ]         │
│  🥈 [          Ville          ]         │
│  🥉 [          Jussi          ]         │
│                                          │
│  Who struggled today?                    │
│  [          Pekka          ]            │
│                                          │
│  [Save Rankings]                         │
└─────────────────────────────────────────┘
```

**Data:** Relative position each game → ELO-style rating over time

**Benefits:**
- Forces honest assessment
- Natural bell curve emerges
- Very fast to complete
- Shows who's consistently top/bottom

---

## Idea 4: Event Sequences (Build-Up Tracking)

**Concept:** Log passing sequences that lead to chances.

```
When a shot happens, quick-log the build-up:

  Shot by: Ville

  Build-up involved: (tap all that apply)
  [Matti ✓] [Jussi ✓] [Pekka] [Antti ✓] [Lauri]

  [Save Sequence]
```

**What this captures:**
- Who's involved in attacking moves
- Combination play patterns
- "Hockey assists" and beyond
- Creative players who start moves

**Analysis:**
- "Matti was involved in 7 of 12 chances created"
- Network graph of who combines with whom

---

## Idea 5: Zone-Based Events

**Concept:** Log events by field zone, not by player. Reconstruct later.

```
┌─────────────────────────────────────────┐
│         OPPONENT GOAL                    │
│  ┌─────────┬─────────┬─────────┐        │
│  │ DEF-L   │ DEF-C   │ DEF-R   │        │
│  │   2🛡️   │   1🛡️   │   0     │        │
│  ├─────────┼─────────┼─────────┤        │
│  │ MID-L   │ MID-C   │ MID-R   │        │
│  │   1⚽   │   3🌟   │   2🔄   │        │
│  ├─────────┼─────────┼─────────┤        │
│  │ ATT-L   │ ATT-C   │ ATT-R   │        │
│  │   2⚽   │   4⚽   │   1⚽   │        │
│  └─────────┴─────────┴─────────┘        │
│           OUR GOAL                       │
└─────────────────────────────────────────┘
```

**Tap zone + event type.** Since you know player positions, can infer who was involved.

**Benefits:**
- See where team is strong/weak
- Identify if attacks always go down one side
- Show defensive vulnerabilities by zone

---

## Idea 6: Substitution Intelligence

**Concept:** Capture WHY subs happen, not just WHEN.

```
┌─────────────────────────────────────────┐
│  SUBSTITUTION                            │
│                                          │
│  Matti → Pekka                          │
│                                          │
│  Reason:                                 │
│  [Tired] [Tactical] [Equal Time]        │
│  [Injury] [Not Performing] [Other]      │
│                                          │
└─────────────────────────────────────────┘
```

**Analysis over season:**
- Players frequently subbed for "tired" → fitness issue?
- Players subbed for "not performing" → consistency issue?
- Pattern of when subs happen (always at same time?)

---

## Idea 7: Interval Snapshots

**Concept:** Every 10 minutes, quick pulse check.

```
┌─────────────────────────────────────────┐
│  10-MINUTE CHECK-IN                      │
│                                          │
│  Who's playing WELL right now?          │
│  [Matti ✓] [Ville ✓] [Jussi] [Pekka]   │
│                                          │
│  Who needs to STEP UP?                   │
│  [Matti] [Ville] [Jussi ✓] [Pekka]     │
│                                          │
│  [Save & Continue]                       │
└─────────────────────────────────────────┘
```

**Only appears during natural breaks** (after goals, injuries, stoppages)

**Analysis:**
- See performance curves through game
- Who starts strong but fades?
- Who grows into the game?

---

## Idea 8: Voice Moments (AI-Assisted)

**Concept:** Speak naturally, AI categorizes.

```
Coach: "Great tackle Matti"
       "Ville needs to track back"
       "Jussi brilliant pass"
       "Lost it in midfield again"

         ↓ AI Processing ↓

Matti:  +1 Defensive Win
Ville:  +1 Needs Improvement (positioning)
Jussi:  +1 Great Play (passing)
Team:   +1 Lost Ball (midfield zone)
```

**Combines with Voice Features** in AI section above.

---

## Idea 9: Opposition Context

**Concept:** Stats mean nothing without context. Log opponent quality.

```
┌─────────────────────────────────────────┐
│  MATCH CONTEXT                           │
│                                          │
│  Opponent level:                         │
│  [Much Weaker] [Weaker] [Equal]         │
│  [Stronger] [Much Stronger]             │
│                                          │
│  Match importance:                       │
│  [Friendly] [League] [Cup] [Final]      │
│                                          │
│  Conditions:                             │
│  [Good] [Wet] [Windy] [Very Cold]       │
└─────────────────────────────────────────┘
```

**Analysis:**
- Performance vs strong vs weak opposition
- Cup game performance vs league
- Who steps up in big games?

---

## Idea 10: Second Screen Mode

**Concept:** Assistant coach or parent logs events while head coach coaches.

```
┌─────────────────────────────────────────┐
│  OBSERVER MODE                           │
│                                          │
│  Connected to: Coach Matti's Game       │
│                                          │
│  You can log:                            │
│  [🌟 Great Play] [⚽ Shot] [🛡️ Defense] │
│                                          │
│  Events sync to main app automatically  │
└─────────────────────────────────────────┘
```

**The head coach focuses on coaching.** Assistant captures data.

**Technical:** WebSocket or Supabase Realtime to sync events in real-time.

---

## Data Model Evolution

```typescript
interface EnhancedGameData {
  // Current
  gameEvents: GameEvent[];  // Goals, assists, cards

  // New: Moment capture
  moments: Moment[];

  // New: Post-game ratings
  playerRatings: PlayerRating[];

  // New: Rankings
  topPerformers: string[];  // Player IDs in order
  struggledToday: string[];

  // New: Build-up sequences
  sequences: AttackSequence[];

  // New: Zone events
  zoneEvents: ZoneEvent[];

  // New: Interval snapshots
  snapshots: IntervalSnapshot[];

  // New: Match context
  context: MatchContext;

  // New: Sub reasons
  substitutions: EnhancedSubstitution[];
}

interface Moment {
  id: string;
  time: number;
  playerId: string;
  type: 'great_play' | 'shot' | 'defensive_win' | 'lost_ball' | 'battle_won' | 'error';
  zone?: FieldZone;
}

interface PlayerRating {
  playerId: string;
  effort: 1 | 2 | 3 | 4 | 5;
  technique: 1 | 2 | 3 | 4 | 5;
  decisions: 1 | 2 | 3 | 4 | 5;
  positioning: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

interface AttackSequence {
  id: string;
  time: number;
  involvedPlayers: string[];
  outcome: 'goal' | 'shot_on' | 'shot_off' | 'chance';
}

interface IntervalSnapshot {
  time: number;
  playingWell: string[];
  needsToStepUp: string[];
}

interface MatchContext {
  opponentLevel: 'much_weaker' | 'weaker' | 'equal' | 'stronger' | 'much_stronger';
  importance: 'friendly' | 'league' | 'cup' | 'final';
  conditions: ('good' | 'wet' | 'windy' | 'cold' | 'hot')[];
}

type FieldZone =
  | 'def_left' | 'def_center' | 'def_right'
  | 'mid_left' | 'mid_center' | 'mid_right'
  | 'att_left' | 'att_center' | 'att_right';

interface EnhancedSubstitution {
  time: number;
  playerOut: string;
  playerIn: string;
  reason: 'tired' | 'tactical' | 'equal_time' | 'injury' | 'not_performing' | 'other';
}
```

---

## What This Enables

### Player Development Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  MATTI VIRTANEN - Season Overview                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Games: 18  |  Minutes: 892  |  Goals: 3  |  Assists: 5     │
│                                                              │
│  MOMENT PROFILE                    RATING TRENDS            │
│  ┌─────────────────────┐          ┌─────────────────────┐   │
│  │ Great Plays:  47    │          │ Effort    ████████░░│   │
│  │ Defensive:    31    │          │ Technique ██████░░░░│   │
│  │ Lost Ball:    22    │          │ Decisions ███████░░░│   │
│  │ Ratio: +2.5         │          │ Impact    ████████░░│   │
│  └─────────────────────┘          └─────────────────────┘   │
│                                                              │
│  GAME-BY-GAME FORM          TOP PERFORMER COUNT             │
│  ┌─────────────────────┐    🥇 5 times                      │
│  │ ▁▃▅▇█▇▅▆▇█▇▅▃▅▇█▇▅ │    🥈 7 times                      │
│  └─────────────────────┘    🥉 3 times                      │
│                                                              │
│  INVOLVED IN: 34% of attacking sequences                    │
│  BEST COMBO: Matti → Ville (12 sequences)                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Team Insights

- "We create most chances through the left side"
- "Second half performance drops significantly"
- "Struggling against stronger opposition"
- "Best defensive record when Matti-Ville partnership plays"

### Parent-Friendly Reports

> *"Matti had a strong game today, earning 6 'Great Play' moments, mostly for his passing in midfield. Coach rated his effort and decision-making highly. He was involved in 3 of our 5 attacking moves that led to shots."*

Way more meaningful than "Matti: 0 goals, 0 assists."

---

## Implementation Priority

| Feature | Effort | Value | Priority |
|---------|--------|-------|----------|
| Moment Capture (tap-tap) | Medium | High | 1 |
| Post-Game Ratings | Low | High | 2 |
| Match Context | Low | Medium | 3 |
| Sub Reasons | Low | Medium | 4 |
| Comparative Ranking | Low | Medium | 5 |
| Interval Snapshots | Medium | Medium | 6 |
| Build-Up Sequences | Medium | Medium | 7 |
| Zone Events | High | Medium | 8 |
| Second Screen Mode | High | High | 9 |
| Voice Moments | High | High | 10 (needs AI) |

---

## Open Questions

1. **Cognitive load:** Can coaches realistically log moments while coaching?
2. **Consistency:** Will ratings be consistent across different coaches?
3. **Gaming:** Will players/parents pressure for better ratings?
4. **Privacy:** Should detailed player assessments be exportable/shareable?
5. **Burnout:** Is post-game rating sustainable every game, or just "important" games?

---

# Additional Feature Ideas (Dream Concepts)

A collection of smaller features that could enhance the app.

---

## Smart Warmup Timer

**Problem:** Coaches forget warmup structure, rush it, or waste time.

```
┌─────────────────────────────────────────┐
│  PRE-GAME WARMUP                    ▶️   │
│                                          │
│  ████████████░░░░░░░░  Phase 2 of 5     │
│                                          │
│  DYNAMIC STRETCHING          2:34 left  │
│  • High knees                           │
│  • Butt kicks                           │
│  • Leg swings                           │
│                                          │
│  Next: Passing squares (4 min)          │
│                                          │
│  [Skip Phase]              [Pause]      │
└─────────────────────────────────────────┘
```

**Features:**
- Pre-built warmup templates by age group
- Audio cues (phone in pocket, earbuds in)
- Adapts to available time ("20 min warmup" vs "10 min warmup")
- Custom templates saveable

**Technical:** Timer with phase config. Vibration + audio alerts. Fully offline.

---

## Weather Integration

**Problem:** Coach arrives at field, weather is terrible, no backup plan.

```
┌─────────────────────────────────────────┐
│  GAME DAY: Sunday 14:00                  │
│                                          │
│  ⛈️  Rain likely (80%) at kickoff        │
│  🌡️  12°C, feels like 9°C               │
│  💨  Wind 25 km/h from SW               │
│                                          │
│  ⚠️  RECOMMENDATION:                     │
│  Consider indoor backup or rain gear     │
│                                          │
│  [View Hourly] [Dismiss]                │
└─────────────────────────────────────────┘
```

**Features:**
- Weather fetch for game location/time
- Alerts 24h and 2h before game
- Wind direction overlay on tactics board
- Historical conditions stored with game

**Technical:** Open-Meteo API (free, no key needed). Cache forecast.

---

## Injury & Availability Tracker

**Problem:** Coach forgets who's injured, creates lineup with unavailable players.

```
┌─────────────────────────────────────────┐
│  SQUAD AVAILABILITY                      │
│                                          │
│  Sunday vs HJK (14 needed, 12 available) │
│                                          │
│  ✅ Available (12)                       │
│     Matti, Ville, Jussi...              │
│                                          │
│  🤕 Injured (2)                          │
│     Pekka - ankle (return ~2 weeks)     │
│     Antti - illness (day-to-day)        │
│                                          │
│  ❌ Unavailable (1)                      │
│     Lauri - family event                │
│                                          │
│  [Update Availability]                   │
└─────────────────────────────────────────┘
```

**Features:**
- Injury log with expected return date
- Recurring unavailability (every other weekend)
- Auto-warn if selecting injured player
- Injury history per player

**Technical:** Availability/injury data model. Filter in player selection UI.

---

## Formation Templates & Quick Switch

**Problem:** Manually dragging 11 players to try a new formation takes forever.

```
┌─────────────────────────────────────────┐
│  FORMATIONS                              │
│                                          │
│  MY TEMPLATES:                           │
│  [4-4-2 Standard]  [4-3-3 Wide]         │
│  [3-5-2 Press]     [4-2-3-1 Control]    │
│                                          │
│  QUICK SWITCH:                           │
│  Current: 4-4-2                          │
│  [→ 4-3-3] [→ 3-5-2] [→ 5-3-2]          │
│                                          │
│  Players auto-move to nearest position   │
└─────────────────────────────────────────┘
```

**Features:**
- Save current formation as template
- Library of common formations
- One-tap formation switch during game
- Smart player-to-position assignment

**Technical:** Position templates as relative coordinates. Matching algorithm.

---

## Opponent Database & Head-to-Head

**Problem:** "Have we played this team before? How did it go?"

```
┌─────────────────────────────────────────┐
│  OPPONENT: HJK U12                       │
│                                          │
│  HEAD-TO-HEAD                            │
│  Played: 4  Won: 1  Drawn: 1  Lost: 2   │
│  Goals for: 5  Against: 8               │
│                                          │
│  LAST MEETING: Oct 15, 2025             │
│  Lost 1-3 (away)                        │
│  Notes: "Strong left winger #7"         │
│                                          │
│  [View All Matches] [Add Scouting Note] │
└─────────────────────────────────────────┘
```

**Features:**
- Auto-link games by opponent name
- Pre-game scouting notes
- Key player warnings
- Historical stats vs opponent

**Technical:** Opponent entity with fuzzy name matching.

---

## Referee Quick Reference

**Problem:** Rules differ by age group. Was that offside legal for U10?

```
┌─────────────────────────────────────────┐
│  RULES QUICK REFERENCE (U12)             │
│                                          │
│  ⚽ Ball size: 4                         │
│  ⏱️  Match: 2 x 25 min                   │
│  👥 Players: 9v9                         │
│  📏 Offside: YES (full rules)           │
│  🔄 Subs: Unlimited, re-entry allowed   │
│                                          │
│  PALLOLIITTO SPECIFIC:                   │
│  • No heading in training (U12-)        │
│  • GK can't punt past halfway           │
│                                          │
│  [Full Rules PDF]                        │
└─────────────────────────────────────────┘
```

**Features:**
- Age group selector
- Finnish (Palloliitto) vs generic rules
- Searchable, offline available

**Technical:** Static content bundled with app.

---

## Travel & Logistics

**Problem:** Away games need coordination. Where is it? When to leave?

```
┌─────────────────────────────────────────┐
│  AWAY GAME LOGISTICS                     │
│                                          │
│  📍 Tapiolan Urheilupuisto, Espoo       │
│  🚗 32 min from home field              │
│  🅿️  Parking: Yes, free                  │
│                                          │
│  SUGGESTED SCHEDULE:                     │
│  12:30 - Leave home field               │
│  13:00 - Arrive, find parking           │
│  13:10 - Warmup                         │
│  13:30 - Kickoff                        │
│                                          │
│  [Open in Maps] [Share with Parents]    │
└─────────────────────────────────────────┘
```

**Features:**
- Venue database with parking notes
- Travel time estimation
- Auto-generate departure time
- Shareable logistics summary

**Technical:** Geocoding, link to native maps. Venue notes storage.

---

## Player Milestones & Celebrations

**Problem:** Youth development needs positive reinforcement.

```
┌─────────────────────────────────────────┐
│  🎉 NEW MILESTONES THIS WEEK            │
│                                          │
│  ⭐ Matti - 50 APPEARANCES              │
│  ⭐ Ville - FIRST GOAL OF SEASON        │
│  ⭐ Jussi - 10 CLEAN SHEETS (GK)        │
│  ⭐ Pekka - 500 MINUTES PLAYED          │
│                                          │
│  [Announce to Team]                      │
└─────────────────────────────────────────┘
```

**Features:**
- Auto-detect milestones (10/25/50/100 appearances, etc.)
- Custom milestones
- Season awards tracking
- Exportable certificate/graphic

**Technical:** Milestone checks after game save. Configurable thresholds.

---

## Practice Attendance & Load Management

**Problem:** Who's been to practice? Who's overplayed?

```
┌─────────────────────────────────────────┐
│  PLAYER LOAD - LAST 14 DAYS             │
│                                          │
│  ⚠️ HIGH LOAD:                           │
│  Matti: 3 games + 4 practices = 280 min │
│                                          │
│  ⚡ LOW LOAD (give more time):           │
│  Pekka: 1 game + 2 practices = 90 min   │
│                                          │
│  PRACTICE ATTENDANCE (last 4):           │
│  Matti ✓✓✓✓  Ville ✓✓✓✗  Pekka ✓✗✓✗   │
│                                          │
│  [Log Practice Session]                  │
└─────────────────────────────────────────┘
```

**Features:**
- Quick practice attendance logging
- Weekly/monthly load calculation
- Flag high/low load players
- Correlate attendance with selection

**Technical:** Practice session entity. Load calculation formula.

---

## Halftime Board

**Problem:** Tactics board has current positions, need clean slate for halftime talk.

```
┌─────────────────────────────────────────┐
│  HALFTIME BOARD                          │
│                                          │
│  [Current Positions] [Clean Board]       │
│                                          │
│  Quick Messages:                         │
│  [PRESS HIGHER] [DROP DEEPER]           │
│  [USE WIDTH] [MARK #7]                  │
│                                          │
│  Timer: 8:00 until 2nd half             │
└─────────────────────────────────────────┘
```

**Features:**
- Separate canvas for halftime drawings
- Pre-made tactical message overlays
- Countdown timer to second half
- Save halftime boards with game

**Technical:** Second canvas state. Message library.

---

## One-Handed Mode

**Problem:** Coach holding coffee/whistle, can only use one thumb.

```
┌─────────────────────────────────────────┐
│                              [≡ Menu]    │
│                                          │
│      (Field takes full screen)           │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ ⏱️ 23:45 │ ⚽ │ 🔄 │ 📋 │ ⏸️  │     │
│  └────────────────────────────────────┘ │
│  All controls at bottom, thumb-reach    │
└─────────────────────────────────────────┘
```

**Features:**
- Bottom-anchored controls
- Larger tap targets
- Swipe gestures for common actions
- Configurable left/right handed

**Technical:** Alternative layout mode. Gesture handlers.

---

## Team Talk Library

**Problem:** What do I say in the huddle? Same speech every week.

```
┌─────────────────────────────────────────┐
│  TEAM TALK IDEAS                         │
│                                          │
│  PRE-GAME:                               │
│  • Focus on your job, not the scoreboard │
│  • First 5 minutes - high energy        │
│                                          │
│  HALFTIME (losing):                      │
│  • We're in this. One goal at a time    │
│  • Don't panic, play our game           │
│                                          │
│  [Add Custom] [Shuffle]                  │
└─────────────────────────────────────────┘
```

**Features:**
- Situation-based talk prompts
- Custom notes saveable
- Random shuffle for variety

**Technical:** Content library, static + user-added.

---

## Photo Moments

**Problem:** Great goal happens, want to capture celebration.

```
After logging a goal:

┌─────────────────────────────────────────┐
│  ⚽ GOAL! Matti (23:45)                  │
│                                          │
│  [📸 Add Photo]                          │
│                                          │
│  [Skip] [Open Camera]                    │
└─────────────────────────────────────────┘
```

**Features:**
- Photo attached to game events
- Post-game photo gallery
- Export report with photos

**Technical:** File attachment to events. Camera API.

---

## Random Picker / Dice

**Problem:** "Who starts in goal?" arguments need fair selection.

```
┌─────────────────────────────────────────┐
│  RANDOM PICKER                           │
│                                          │
│  Question: Who starts in goal?          │
│  [Matti ✓] [Ville ✓] [Pekka ✓]         │
│                                          │
│       🎲 [ PICK ]                        │
│                                          │
│  Result: VILLE                           │
└─────────────────────────────────────────┘
```

**Features:**
- Random player picker
- Team splitter for training
- Coin flip for kickoff
- History to prevent "do-overs"

**Technical:** Simple RNG with player filter.

---

## Season Goals & Tracking

**Problem:** What are we trying to achieve? No measurable goals.

```
┌─────────────────────────────────────────┐
│  SEASON GOALS 2025-26                    │
│                                          │
│  TEAM GOALS:                             │
│  ☑️ Every player gets 200+ minutes       │
│     Progress: 11/14 achieved             │
│                                          │
│  ◻️ Concede fewer than 30 goals          │
│     Progress: 22 (8 games left)          │
│                                          │
│  INDIVIDUAL GOALS:                       │
│  Matti: Score from outside box ◻️        │
│  Ville: 5 clean sheets ☑️                │
│                                          │
│  [Add Goal]                              │
└─────────────────────────────────────────┘
```

**Features:**
- Team and individual goals
- Auto-track measurable goals
- Manual check-off for qualitative
- End-of-season review

**Technical:** Goal entity with type, threshold, linked metric.

---

## Implementation Priority Summary

| Feature | Effort | Value | Needs Cloud? |
|---------|--------|-------|--------------|
| Formation Templates | Medium | High | No |
| Injury/Availability | Medium | High | No |
| Player Milestones | Low | High | No |
| Practice Attendance/Load | Medium | High | No |
| Smart Warmup Timer | Low | Medium | No |
| Weather Integration | Low | Medium | Yes (API) |
| Opponent Database | Medium | Medium | No |
| Season Goals | Medium | Medium | No |
| Halftime Board | Low | Medium | No |
| One-Handed Mode | Medium | Medium | No |
| Travel & Logistics | Medium | Medium | No |
| Referee Quick Reference | Low | Medium | No |
| Photo Moments | Medium | Medium | Optional |
| Team Talk Library | Low | Low | No |
| Random Picker | Low | Low | No |

**Recommended build order:**
1. Formation Templates - Huge time saver, differentiator
2. Injury/Availability - Solves real pain point
3. Player Milestones - Positive reinforcement for youth
4. Practice Attendance/Load - Professional feature for volunteers

---

*This document is a collection of ideas for future exploration. No commitment to implement any specific feature.*
