# Future Features (Dream Concepts)

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

*This document is a collection of ideas for future exploration. No commitment to implement any specific feature.*
