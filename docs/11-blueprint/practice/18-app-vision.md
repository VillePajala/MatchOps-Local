# 18. App Vision — MatchOps Practice

> **Audience**: AI agent building the new app
> **Purpose**: Comprehensive description of what the practice planning app is, what it does, its features, and how it fits in the MatchOps product family. Read this BEFORE reading any other blueprint document. This is the "what" and "why" — the other documents are the "how".

---

## 1. App Identity

### Name

**MatchOps Practice**

This is the second app in the MatchOps family. The first app, MatchOps (sometimes called MatchOps Game or MatchOps Local), handles game day. This app handles everything that happens between games — practice planning, exercise management, attendance tracking, and session reflection.

### Tagline

**"Design . Drill . Reflect"**

This parallels the MatchOps Game tagline "Plan . Track . Develop" with the same three-word dot-separated structure. The words map to the app's core loop:

| Word | What It Means | App Feature |
|------|--------------|-------------|
| Design | Build practice sessions from an exercise library | Practice planner, field diagrams |
| Drill | Run the session on the field | Session view, attendance, live notes |
| Reflect | Learn from what happened | Post-practice reflection, attendance stats |

Finnish translation: **"Suunnittele . Harjoittele . Arvioi"**

### Visual Identity

The app MUST look like it belongs in the same family as MatchOps Game. A coach who uses both apps should feel immediately at home.

| Element | Specification | Notes |
|---------|--------------|-------|
| Primary font | **Rajdhani** (headings, nav) | Same as MatchOps Game |
| Body font | System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI'...`) | Same as MatchOps Game |
| Background | `slate-900` (`#0f172a`) | Dark theme, same base |
| Primary accent | `indigo-600` / `indigo-500` | Buttons, active states, progress bars |
| Secondary accent | `amber-400` / `amber-500` | Warnings, highlights, star/favorite markers |
| Surface color | `slate-800` (`#1e293b`) | Cards, modals, elevated surfaces |
| Border color | `slate-700` (`#334155`) | Dividers, card borders |
| Text primary | `white` | Headings, important text |
| Text secondary | `slate-400` | Descriptions, labels, metadata |
| Error | `red-400` / `red-500` | Validation errors, destructive actions |
| Success | `green-400` / `green-500` | Confirmations, completed states |
| Theme | **Dark-only at launch** | Light theme is a future consideration |

### App Icon Concept

Same style as MatchOps Game (geometric, bold, works at small sizes) but with a practice-specific element. MatchOps Game uses a soccer ball / tactical element. MatchOps Practice should use a **clipboard with a field diagram** or **cone/whistle motif** — something that says "preparation" rather than "game day". Same amber/indigo color treatment on dark background.

### Differentiation from MatchOps Game

Even though they share visual DNA, the apps have distinct personalities:

| Aspect | MatchOps Game | MatchOps Practice |
|--------|--------------|-------------------|
| Mood | Intense, real-time, "go time" | Thoughtful, creative, "prep time" |
| Primary interaction | Timer running, quick taps | Select-and-place diagram building, visual editors |
| Data pattern | One active document (current game) | Many documents (exercise library + sessions) |
| Time pressure | Yes (live game) | No (planning at home) |
| On-field usage | Full app interaction (subs, events, timer) | Glance-and-go (read the Practice Card, move on) |

---

## 2. What This App Does

### Elevator Pitch

MatchOps Practice is a practice session planning tool for youth soccer and futsal coaches. **The app nails two things perfectly**:

1. **An intuitive visual exercise creator** — draw field diagrams with player positions, equipment, and movement arrows using a purpose-built select-and-place editor. Build exercises once, reuse them forever.

2. **A glanceable Practice Card** — the entire practice session rendered as a single visual overview (a grid of exercise cells with diagrams) that a coach can pull up on their phone and instantly understand during practice. No scrolling, no navigation, no thinking — glance and go.

A coach builds a library of exercises with field diagrams, then assembles them into structured practice sessions. Sessions support both sequential flow (everyone does the same thing) and **station rotation** (multiple coaches each run a station, player groups rotate through). The app generates a Practice Card — a single-screen visual summary — that coaches can share with assistants and reference on the field. Track attendance of players and coaches, reflect on what worked, and build on it next week.

The app works entirely offline on your phone or tablet, with optional cloud sync for backup and cross-device access.

### The Two UX Modes (Same Philosophy as MatchOps Game)

Like MatchOps Game, this app has two distinct usage contexts with different UX requirements:

| Mode | Context | UX Priority |
|------|---------|-------------|
| **Planning mode** | At home, on the couch, no rush | Rich editing, visual tools, creative exploration |
| **Field mode** | On the field, phone in hand, between exercises | Instant glanceability, zero navigation, large text |

In MatchOps Game, planning = setting up lineups and formations before the game, field = running the timer and tracking events during the game. In MatchOps Practice, planning = building exercises and assembling sessions at home, field = referencing the Practice Card during practice.

**Field mode is the Practice Card**. When a coach opens today's practice on the field, they see the full session as a visual grid — each exercise cell shows the field diagram, exercise name, duration, and key coaching points. That is the core output artifact of the entire app.

### How It Complements MatchOps Game

MatchOps Game is your **game day companion** — it runs while the match is happening, tracking time, score, substitutions, and events in real time. MatchOps Practice is your **preparation tool** — it helps you plan what happens on the training ground between games.

```
Monday-Friday: MatchOps Practice (plan and run training sessions)
Saturday:      MatchOps Game (track the match)
Sunday:        MatchOps Practice (reflect on last week, plan next week)
```

The two apps share player rosters, teams, seasons, and coaching staff data. A coach who manages their team in one app sees the same players and structure in the other. In the future, a practice session could link to an upcoming game ("Tuesday's training focuses on set pieces for Saturday's match") — but that integration is not in scope for the initial release.

---

## 3. Target Users

### Primary: Youth Soccer Coaches (Ages 8-15)

The core user is a coach working with one or two youth teams. They run 2-4 training sessions per week, each 60-90 minutes. They need to:
- Plan sessions ahead of time (not improvise on the field)
- Build up a library of exercises they know work
- Track which exercises they have used and when
- Remember what they coached last week to avoid repetition
- Keep attendance records for the club

**Typical profile**: Age 30-50, has a coaching license (D or C level in SPL system), uses a smartphone on the field, plans sessions on a tablet or laptop at home.

### Secondary: Club-Level Coaches Managing Multiple Age Groups

Coaches who work across several teams (e.g., U10, U12, U14) need:
- Exercises tagged by age suitability (an exercise for U14 may not work for U10)
- Templates they can adapt per age group
- Quick duplication of sessions across teams

### Tertiary: Parent-Coaches with Limited Experience

In Finnish youth soccer, many coaches are parents who volunteer. They may not have formal coaching education. They need:
- Simple, guided session planning (not a blank canvas)
- Pre-built exercise ideas they can learn from
- Confidence that a session is well-structured (warm-up, main, cool-down)
- A printable plan they can bring to the field

### Finnish Context: SPL Youth Development Framework

Suomen Palloliitto (SPL, the Finnish Football Association) publishes age-appropriate development guidelines. The app should align with SPL's coaching philosophy:
- **Ages 6-9 (Leikkivaihe / Play phase)**: Fun-focused, basic movement skills, small-sided games
- **Ages 10-12 (Taitovaihe / Skill phase)**: Technical fundamentals, 1v1, ball mastery
- **Ages 13-15 (Pelitaitovaihe / Game understanding phase)**: Tactical awareness, positional play, team concepts
- **Ages 16+ (Kilpailuvaihe / Competition phase)**: Physical conditioning, advanced tactics

The exercise categories and age suitability tags should make it natural to plan sessions that follow this progression. The app does NOT enforce SPL guidelines — it just makes it easy to follow them.

---

## 4. Core Features

### 4.1 Exercise Library

**What**: A personal library of training exercises that the coach builds over time. Each exercise is a reusable building block that can be dropped into any practice session.

**Why a coach needs it**: Without a library, coaches either repeat the same 10 exercises forever or waste time searching the internet before every practice. A well-organized personal library with field diagrams means a coach can plan a full session in minutes, not hours.

**How it works**:

- **Create**: Tap "New Exercise", fill in name, description, category, duration, and coaching points. Set up the field diagram visually. Save to library.
- **Categorize**: Each exercise has a primary category and optional tags:
  - Categories: `warmup`, `technical`, `tactical`, `physical`, `smallSidedGame`, `cooldown`, `rondo`, `setPiece`, `goalkeeping`, `other`
  - Tags: Free-form strings for flexible filtering (e.g., "passing", "1v1", "pressing", "build-up", "transition")
- **Search and filter**: Text search across name, description, tags. Filter by category, age suitability, intensity, duration range, player count range.
- **Favorite**: Star/bookmark exercises for quick access. A "Favorites" filter shows bookmarked exercises.
- **Each exercise includes**:
  - Name (required, max 100 characters)
  - Description (rich text or plain text, detailed explanation of the exercise)
  - Duration (default minutes, adjustable per session)
  - Intensity (`low` / `medium` / `high`)
  - Player count (min and max)
  - Age group suitability (multi-select: U8, U10, U12, U14, U16, adult)
  - Equipment needed (cones, balls, bibs, goals, etc. with quantities)
  - Coaching points (ordered list of key things to watch for and correct)
  - Variations (alternative versions: "with 2-touch limit", "add a neutral player")
  - Progressions (how to make harder or easier)
  - Interactive field diagram (see section 4.3)

**Example exercise**:
```
Name: Rondo 4v2
Category: Rondo
Duration: 10 min
Intensity: Medium
Players: 6-8
Age groups: U12, U14, U16
Equipment: 8 cones (grid markers), 1 ball
Description: Four attackers maintain possession against two defenders
             inside a 10x10m grid. Defenders who win the ball switch
             with the last attacker who lost it.
Coaching points:
  1. Body shape — open up to receive
  2. Play away from pressure (pass to the free player)
  3. Defenders: work as a pair, cut passing lanes
Variations:
  - 2-touch limit for attackers
  - 5v2 for younger / less skilled groups
  - Add a neutral "joker" who always plays with attackers
Progressions:
  - Easier: Larger grid, more attackers
  - Harder: Smaller grid, 1-touch, add a second ball
```

### 4.2 Practice Session Planner

**What**: Build a complete practice session from ordered blocks. Blocks can be simple activities (everyone does the same thing) or **station rotations** (multiple parallel exercises with groups cycling through). The session generates a **Practice Card** — a single visual overview that coaches use on the field.

**Why a coach needs it**: A good practice has structure — warm-up, main activities, and cool-down. The main activities are often organized as **stations**: each coach (or pair of coaches) sets up one exercise on a section of the field, and player groups rotate through all stations. Without a planning tool, coaches coordinate this on WhatsApp with text messages. A visual planner with station support turns a chaotic process into a clear, shareable plan.

**How it works**:

1. **Create a session**: Set date, start time, team, season, and training theme (e.g., "Build-up play from the back")
2. **Add blocks**: Each block is one segment of the session. A block is either:
   - **Activity** (everyone together): One exercise, all players do it simultaneously
   - **Stations** (parallel exercises): 2-4 exercises running in parallel, each staffed by a coach, player groups rotate
3. **Block details**:
   - Phase: `warmup` / `main` / `cooldown` / `transition` / `break`
   - Duration: How many minutes this block (or rotation cycle) runs
   - Exercise: Pick from library OR write a free-form description
   - Coaching focus: What to emphasize THIS time
   - Notes: Anything else to remember
4. **Station rotation blocks**:
   - Set number of stations (2-4)
   - Assign an exercise to each station (from library or custom)
   - Assign coach(es) to each station
   - Set rotation duration (how long each group spends at each station)
   - Groups are automatically calculated from the number of stations
   - Coaches stay at their station — groups rotate
5. **Off-field time**: Blocks for activities outside the field — stretching, movement patterns (animal walks, dynamic warm-up), team talks. These are `warmup` or `cooldown` phase blocks with free-form descriptions.
6. **Auto-calculated total**: Header shows total duration summed from all blocks. A visual indicator warns if the session exceeds available time.
7. **Session-specific overrides**: When using a library exercise, the coach can override the title, description, player count, or intensity for THIS session without modifying the original exercise.
8. **Field diagram per block/station**: Each block or station can have its own field diagram. By default it inherits the exercise's diagram, but the coach can modify it.

**Example session with stations**:
```
Title: Tuesday Technical Training
Date: 2026-03-17, 17:00
Team: U12 Boys
Theme: Passing and receiving under pressure
Coaches: Coach Ville, Coach Mikko, Coach Jari

Block 1: Warm-up — Jogging + dynamic stretching (10 min) [together, off-field]
Block 2: Warm-up — Ball mastery in pairs (10 min) [together, on-field]

Block 3: STATIONS — 3 stations, 12 min per rotation (36 min total)
  Station A: Rondo 4v2 — Coach Ville
  Station B: Passing in triangles — Coach Mikko
  Station C: 1v1 dribbling — Coach Jari
  (Groups rotate: Blue → A → B → C, Red → B → C → A, White → C → A → B)

Block 4: Break — Water break (5 min)

Block 5: Main — 7v7 match with passing rules (20 min) [together]

Block 6: Cool-down — Static stretching + recap (10 min) [together, off-field]

Total: 91 minutes
```

### 4.2.1 The Practice Card (Core Output Artifact)

**What**: A single-screen visual summary of the entire practice session, rendered as a grid of exercise cells. This is the primary output of the planning process and the primary reference during practice.

**Why this is critical**: During practice, a coach cannot scroll through pages or navigate between screens. They need to glance at their phone for 3 seconds and know exactly what is happening. The Practice Card is like a cheat sheet — everything on one screen.

**How it looks**:

```
┌─────────────────────────────────────────────┐
│  U12 Tuesday Training                       │
│  "Passing under pressure" · 91 min          │
│  Coaches: Ville, Mikko, Jari                │
├──────────┬──────────┬──────────┬────────────┤
│ Warm-up  │ Station A│ Station B│ Station C  │
│ Ball     │ Rondo    │ Passing  │ 1v1        │
│ mastery  │ 4v2      │ triangles│ dribbling  │
│          │          │          │            │
│ [field   │ [field   │ [field   │ [field     │
│  diagram]│  diagram]│  diagram]│  diagram]  │
│          │          │          │            │
│ 10 min   │ 12 min   │ 12 min   │ 12 min    │
│ together │ C. Ville │ C. Mikko │ C. Jari   │
├──────────┴──────────┴──────────┴────────────┤
│ 7v7 match (20 min) · Stretching (10 min)    │
└─────────────────────────────────────────────┘
```

The Practice Card:
- Shows the session header (team, theme, duration, coaches)
- Renders each exercise in a grid cell with a **miniature field diagram**
- Stations are shown side-by-side (these happen in parallel)
- Simple activities (warm-up, match, cool-down) take full width or are summarized
- Duration and assigned coach shown per cell
- **Readable at arm's length on a phone screen in outdoor lighting**

The Practice Card is generated from the session data — it is a **view**, not a separate entity. The planning editor builds the data, the Practice Card renders it.

### 4.2.2 Sharing the Practice Card

**What**: Send the practice plan to other coaches so they can prepare for their station.

**Why this matters**: In station rotation, each coach needs to know their exercise. The head coach plans the session, then shares it with assistant coaches. The sharing format determines what the receiving coach can do with the plan.

**Sharing formats (progressive capability)**:

| Format | How | What the recipient gets | Growth potential |
|--------|-----|------------------------|------------------|
| **Screenshot/Image** | OS share sheet (share the Practice Card as an image) | A picture they can view anywhere | None — it is a dead end |
| **PDF** | Client-side generation, share or print | A formatted document with diagrams | None — print and go |
| **App link** (future) | Share a URL that opens the plan in the app | Full interactive view — tap an exercise to see details, coaching points, variations | **High** — recipient installs the app to view the plan, becomes a user |

**For initial release**: Support screenshot sharing (render the Practice Card, use the OS share sheet) and PDF export. Design the data model to support app-link sharing in the future (the `PracticeSession` ID is already a stable reference).

**Why app-link sharing is a growth engine**: If Coach Ville shares a practice plan with Coach Mikko via an app link, Mikko opens it in the app and sees the full interactive plan — field diagrams he can zoom into, coaching points he can read, exercises he can copy to his own library. This creates organic adoption: every shared practice plan is an invitation to try the app. This is NOT in scope for launch, but the data model and sharing flow should make it easy to add later.

### 4.3 Interactive Field Diagram (CORE FEATURE #1)

**What**: A visual canvas representing a soccer or futsal field where the coach places player markers, equipment (cones, goals), and draws movement lines (runs, passes, dribbles). Used both in the exercise library and in practice session blocks/stations.

**Why this is one of the two features we must nail**: The field diagram is the visual language of coaching. Every exercise is best explained with a picture. If this tool is intuitive and fast, coaches will build rich libraries with beautiful diagrams. If it is clunky, they will skip it and the app loses its core value proposition. Coaches currently draw these on paper or use generic drawing apps — a purpose-built field diagram tool should be **dramatically** more efficient and produce better results.

**Design target**: A coach should be able to create a diagram for a simple exercise (6 players, 4 cones, 2 movement arrows) in **under 60 seconds**. The tool should feel like it was built specifically for soccer coaches, not adapted from a generic drawing app.

**How it works**:

- **Field types**: Full field, half field, quarter field, or a one-third-width channel. Custom dimensions for drill-specific areas.
- **Player markers**: Place colored circles with labels on the field. Three teams: A (attackers, one color), B (defenders, another color), neutral (third color). Labels can be jersey numbers, position codes ("GK", "LB"), or custom text.
  - **Interaction model: SELECT-AND-PLACE, NOT drag-and-drop**. The coach taps a player marker in the toolbar to select it, then taps the field to place it. This matches the MatchOps Game pattern and works reliably on mobile touchscreens.
- **Equipment markers**: Place cones (with color), poles, small goals, full goals, ladders, hurdles, and markers.
- **Movement arrows**: Draw arrows for runs, passes, dribbles, and shots. Each arrow type has a distinct visual style (solid for runs, dashed for passes, wavy for dribbles). Multi-point paths for curved runs.
- **Highlight zones**: Draw rectangles or circles to mark drill areas, playing zones, or restricted zones. Semi-transparent colored fill with optional label.
- **Text annotations**: Place text labels anywhere on the field for instructions or notes.
- **Ball position**: A single ball marker can be placed on the field.

**All positions stored as relative coordinates (0-1 range)**, not pixels. This ensures diagrams render correctly at any screen size. See `11-ui-patterns.md` section 6 and `17-data-model-sketch.md` for the `FieldDiagram` interface.

### 4.4 Practice Templates

**What**: Save any practice session structure as a reusable template. Templates preserve the block sequence (phases, durations, exercise assignments) without date-specific details.

**Why a coach needs it**: Most coaches run similar session structures week after week — the specific exercises change, but the shape (15 min warm-up, 30 min technical, 30 min game, 15 min cool-down) stays the same. Templates eliminate the repetitive scaffolding work.

**How it works**:

- **Create from session**: After building a practice session, the coach can "Save as Template". The template captures the block structure, exercise references, and phase labels.
- **Create from scratch**: Build a template directly in the template editor. Blocks can reference specific exercises or be placeholders ("Insert any warm-up exercise here").
- **Template categories**: Tag templates with labels like "Passing focus", "Game day -1", "Recovery session", "Rainy day (indoor)", "First practice of season".
- **Quick-start**: From the practice list, tap "New from Template" to select a template. The app creates a new session pre-populated with the template's blocks, which the coach can then customize.
- **Favorite**: Star frequently-used templates for quick access.

**Example templates**:
```
Template: "Standard 90-min Training"
  Block 1: Warmup (15 min) — [any warm-up exercise]
  Block 2: Technical (15 min) — [placeholder]
  Block 3: Technical (15 min) — [placeholder]
  Block 4: Break (5 min)
  Block 5: Small-sided game (20 min) — [placeholder]
  Block 6: Match (15 min) — [placeholder]
  Block 7: Cooldown (5 min) — [any cool-down exercise]

Template: "Game Day -1 (Light)"
  Block 1: Warmup (10 min) — Dynamic activation
  Block 2: Main (15 min) — Set pieces practice
  Block 3: Main (15 min) — Tactical walkthrough
  Block 4: Cooldown (10 min) — Stretching + team talk
```

### 4.5 Player & Team Management (Shared with MatchOps Game)

**What**: Manage player rosters with jersey numbers, positions, and team assignments. Same data model as MatchOps Game.

**Why a coach needs it**: The coach needs to know who is on the team to take attendance, plan exercises for the right player count, and track participation over time.

**How it works**:

- **Player fields**: Name, jersey number, position, active/inactive status, team assignment, notes, contact info.
- **Team fields**: Name, game type (soccer/futsal), bound season/tournament.
- **Multiple teams**: A coach managing U12 and U14 can switch between rosters.
- **Data sharing**: If both MatchOps Game and MatchOps Practice use the same cloud account, they share the same player and team data. In local mode, each app has its own data (no cross-app sharing on-device).

### 4.6 Attendance Tracking

**What**: Mark each player as present, absent, late, injured, or excused for every practice session. Track participation rates over time.

**Why a coach needs it**: Finnish clubs expect coaches to keep attendance records. Parents ask "how many practices did my child attend?" and coaches need an answer. Attendance data also reveals patterns — a player who misses every Thursday might have a schedule conflict worth addressing.

**How it works**:

- **Per-session checklist**: When opening a practice session, the roster appears with checkboxes. Default state is `present` (most players attend). Tap to cycle through statuses: `present` -> `absent` -> `late` -> `injured` -> `excused`.
- **Late arrival time**: For `late` players, optionally record what time they arrived.
- **Notes**: Free-text note per attendance record (e.g., "Left early — knee pain", "Excused — school event").
- **Attendance statistics**: Per-player view showing attendance rate across the season. Example: "Matti Meikalainen: 85% attendance (34/40 practices), 3 late, 2 injured, 1 excused".
- **Team overview**: A grid view showing all players x all sessions for a quick visual of participation patterns.

### 4.7 Season & Calendar

**What**: Associate practice sessions with seasons. View scheduled and completed practices on a calendar.

**Why a coach needs it**: A season gives context to practice data. "This season we had 45 practices with 78% average attendance" is meaningful. The calendar view provides a bird's-eye view for weekly and monthly planning.

**How it works**:

- **Seasons**: Same model as MatchOps Game (name, start date, end date, game type, gender, age group). Practices belong to a season.
- **Calendar view**: Month view showing practice sessions as colored dots/markers on dates. Tap a date to see that day's sessions. Color-coding by status: draft (gray), planned (blue), completed (green).
- **Week view**: A more detailed view showing each day's sessions with block summaries and total duration.
- **Quick navigation**: Jump to current week, navigate forward/backward by week or month.
- **Copy week**: "Copy last week's practices to this week" — duplicates session structures with updated dates.

### 4.8 Personnel Management (Shared with MatchOps Game)

**What**: Track coaching staff with roles, contact information, and certifications. Assign coaches to practice sessions and to specific stations.

**Why a coach needs it**: A team typically has a head coach, 1-2 assistant coaches, maybe a goalkeeper coach or physio. In station rotation practices, each coach is responsible for a specific station. The plan needs to show who runs what.

**How it works**:

- **Personnel fields**: Name, role (head coach, assistant coach, goalkeeper coach, physio, team manager), email, phone, certifications (e.g., "UEFA B", "SPL C"), notes.
- **Session-level assignment**: When creating a practice session, mark which coaches will be present. This determines who is available for station assignment.
- **Station-level assignment**: When building a station rotation block, assign one or more coaches to each station. The Practice Card shows which coach is at which station.
- **Certifications tracking**: Record coaching licenses and their expiry dates. Useful for club administration.

### 4.9 Equipment Management

**What**: Exercises declare what equipment they need. The practice planner aggregates equipment needs across all blocks into a single checklist.

**Why a coach needs it**: Nothing is worse than arriving at the field and realizing you forgot the bibs. An auto-generated equipment list from the planned session prevents this.

**How it works**:

- **Per-exercise declaration**: When creating an exercise, list required equipment with type, quantity, and optional color/notes. Example: `8x cones (orange), 1x ball, 4x bibs (blue), 4x bibs (red)`.
- **Per-session aggregation**: The practice session view shows a "Equipment Needed" section that sums up all equipment from all blocks. If Block 2 needs 8 cones and Block 5 needs 12 cones, the session shows "12 cones" (the max concurrent need, not the sum — because you reuse equipment between blocks).
  - **Implementation note**: For v1, simple summation (sum all equipment across blocks) is acceptable. Max-concurrent-need calculation is a future optimization.
- **Manual additions**: The coach can add equipment that is not tied to a specific exercise (e.g., "first aid kit", "water bottles").
- **Equipment types**: `cone`, `ball`, `bib`, `goal` (small/full), `pole`, `ladder`, `hurdle`, `marker`, `other`.

### 4.10 Export & Share

**What**: Share the Practice Card with other coaches and export data for reporting. This is the primary distribution mechanism for practice plans.

**Why a coach needs it**: The head coach plans the session, but 2-3 other coaches need to know the plan before practice. Today this happens via WhatsApp messages ("you take the rondo, I take the passing drill"). A shareable Practice Card replaces this with a clear visual plan.

**How it works**:

- **Practice Card screenshot**: The primary sharing method. The Practice Card (the visual grid overview) is rendered as an image and shared via the OS share sheet (WhatsApp, email, etc.). The recipient sees the full plan at a glance.
- **PDF export**: Client-side PDF generation of the full practice session: Practice Card on page 1, detailed exercise descriptions with coaching points on subsequent pages. Uses `html2canvas` + `jsPDF` or similar.
- **Excel export**: Attendance data can be exported as an Excel spreadsheet (one row per player, columns for each session date). Uses the same `xlsx` CDN approach as MatchOps Game.
- **App-compatible sharing (future)**: Generate a link that opens the practice plan in the app. The recipient can view the full interactive plan, zoom into field diagrams, and copy exercises to their own library. This is the future growth engine (see section 4.2.2). NOT in scope for initial release but influences data model design.

---

## 5. User Flows

### 5.1 First Launch

```
1. App loads → Welcome screen with MatchOps Practice branding
2. Choose mode:
   - "Use Locally" → No account, data stays on device, start immediately
   - "Create Account" → Email/password signup → verify email → logged in
3. Create first team → Enter team name, select game type (soccer/futsal)
4. Add players → Enter names and jersey numbers (can do later)
5. Dashboard → Ready to create first practice or exercise
```

The onboarding should be FAST. A coach who taps "Use Locally" should be on the dashboard in under 10 seconds. Do not front-load setup — let the coach add teams and players when they naturally need them (e.g., when creating a practice session and selecting a team).

### 5.2 Planning a Practice Session

```
1. Dashboard → "New Practice" button
2. Set basics: date (defaults to today), start time, select team, select season
3. Mark which coaches will be at this practice
4. Set theme: optional text like "Passing under pressure"
5. Add blocks:
   a. Choose block type: Activity (everyone together) or Stations (parallel)
   b. For Activity: pick exercise from library or write custom, set duration
   c. For Stations:
      - Set number of stations (2-4)
      - For each station: pick exercise, assign coach
      - Set rotation duration (how long each group stays at each station)
   d. Choose phase (warmup/main/cooldown/break)
   e. Optionally adjust coaching focus for THIS session
6. Add off-field blocks (stretching, warm-up jog, team talk)
7. Reorder blocks if needed
8. Review: total duration at top, equipment list aggregated, coach assignments visible
9. Preview the Practice Card (the visual grid output)
10. Save → status = "planned"
11. Share Practice Card with assistant coaches
12. After practice: mark as "completed", fill in reflection
```

**Critical UX requirements**:
- Adding a block and picking an exercise should take **3 taps maximum**. The exercise picker should show recently used exercises and favorites prominently.
- The station assignment flow must be fast — the coach picks exercises and assigns coaches in a single screen, not a multi-step wizard.
- The Practice Card preview should be accessible with one tap from the editor.

### 5.3 Building an Exercise

```
1. Exercise Library → "New Exercise" button
2. Fill basics: name (required), category, duration, intensity
3. Write description (what the exercise is and how it works)
4. Set up field diagram:
   a. Select field type (full/half/quarter)
   b. Place player markers (select marker → tap field)
   c. Place equipment markers (select cone/goal → tap field)
   d. Draw movement arrows (select arrow type → tap start → tap end points)
   e. Optionally add zones and text annotations
5. Add coaching points (ordered list — what to watch for and correct)
6. Add variations and progressions
7. Set equipment list, player count range, age suitability
8. Save → exercise appears in library
```

**Critical UX requirement**: The field diagram editor is the most complex screen. It must be intuitive enough that a coach can set up a simple diagram (6 players + 4 cones + 2 arrows) in under 60 seconds. Start with a minimal toolbar and let the coach discover advanced features gradually.

### 5.4 During Practice (On the Field)

```
1. Open the app → tap today's planned practice
2. See the Practice Card (full session as a visual grid)
3. The Practice Card shows everything: all exercises, stations, durations, coach assignments
4. Tap any exercise cell → expanded view with full diagram, coaching points, variations
5. Attendance: quick toggle available from the Practice Card view
6. Quick notes: tap-and-hold any exercise cell to add a note
7. After practice: prompted to mark session as "completed"
```

**Critical UX requirement**: The Practice Card IS the on-field experience. It must be:
- **Readable at arm's length** on a phone screen in outdoor lighting
- **Everything on one screen** — no scrolling to find what is next
- **Large enough to identify exercises** — field diagram thumbnails must be recognizable
- **Zero navigation required** — the coach glances at the phone for 3 seconds, puts it back in their pocket

The coach does NOT "advance through blocks" like a slideshow. They see the entire practice at once and know what is happening now, what is next, and who is running each station. This is fundamentally different from MatchOps Game's live-tracking approach — during practice, the app is a reference card, not an active tool.

### 5.5 End of Week Review

```
1. Dashboard shows this week's summary: X practices completed, Y% attendance
2. Calendar view → review completed practices
3. Tap a completed practice → see reflection fields
4. Fill in: "What worked?", "What to improve?", per-player notes
5. Look at attendance tab → spot patterns (who missed this week?)
6. Plan next week:
   a. "New Practice" for each day
   b. Or "Copy last week" and adjust exercises
   c. Or "New from Template" for standard sessions
```

---

## 6. What This App Does NOT Do

Define clear boundaries to prevent scope creep.

| Out of Scope | Why | Alternative |
|-------------|-----|-------------|
| **Live game tracking** | That is MatchOps Game. Do not replicate timer, score, substitution, or event tracking. | Use MatchOps Game on match day. |
| **Video analysis** | Requires video upload, storage, and playback infrastructure. Different product entirely. | Use Hudl, Veo, or similar dedicated tools. |
| **Opponent scouting** | Different domain, requires match data from other teams. | Maintain notes in a separate document. |
| **Player fitness data / wearables** | Requires hardware integrations (GPS vests, heart rate monitors). Enterprise-level feature. | Use the wearable vendor's own software. |
| **Communication with parents/players** | Messaging, notifications, group chats are a different product category. | Use WhatsApp, Telegram, email, or Nimenhuuto. |
| **Scheduling with notifications** | Push notifications require backend infrastructure and add complexity. The app records planned dates but does not send reminders. | Use Google Calendar or phone alarms for reminders. |
| **Drill animation / playback** | Animating player movements on the field diagram is a compelling future feature but too complex for initial release. | Static diagrams with arrows convey the same information. |
| **Pre-built exercise database** | Curating and maintaining a content library is an editorial effort, not a software feature. | The coach builds their own library. Future: allow community sharing. |
| **Multi-coach collaboration** | Real-time collaboration (multiple coaches editing the same session) requires conflict resolution and presence awareness. | One coach plans, others view the printed/shared plan. |

---

## 7. How It Relates to MatchOps Game

### Shared Entities

These data entities are **identical** between the two apps. Same TypeScript interfaces, same database tables, same transforms.

| Entity | Used in MatchOps Game | Used in MatchOps Practice |
|--------|----------------------|--------------------------|
| **Player** | On-field placement, substitutions, events | Attendance tracking, player count for exercises |
| **Team** | Game assignment, roster filtering | Practice assignment, roster filtering |
| **Season** | Game belongs to season | Practice belongs to season |
| **Tournament** | Game belongs to tournament | Not directly used (practices are not tournament-specific) |
| **Personnel** | Game coaching staff | Practice coaching staff |
| **AppSettings** | Language, theme, defaults | Language, theme, defaults (different default fields) |

### Shared Architecture

| Layer | What Is Shared | What Differs |
|-------|---------------|-------------|
| **DataStore interface** | Pattern (interface + LocalDataStore + SupabaseDataStore + factory) | Domain methods (game CRUD vs practice CRUD) |
| **Auth** | Identical (AuthService, SupabaseAuthService, LocalAuthService, AuthProvider) | Nothing |
| **Supabase client** | Identical (client.ts, lazy initialization) | Nothing |
| **React Query** | Same library, same configuration, same retry logic | Different query keys, different hooks |
| **Sync engine** | Same pattern (SyncQueue, SyncEngine, SyncedDataStore) | Different entity types in the queue |
| **Error handling** | Identical (error taxonomy, retry, Sentry) | Nothing |
| **i18n** | Same setup (i18next, type generation, fi/en) | Different translation keys |
| **PWA** | Same patterns (service worker, manifest, install prompt) | Different app name, icon, theme color |

### Shared Visual Identity

| Element | Shared |
|---------|--------|
| Rajdhani font | Yes |
| Amber/indigo/slate palette | Yes |
| Dark theme | Yes |
| Card/modal/form patterns | Yes |
| Loading/error/empty states | Yes |
| Toast notifications | Yes |
| Bottom tab navigation (mobile) | Yes (different tabs) |
| Side navigation (desktop) | Yes (different items) |

### Future Integration Possibilities

These are NOT in scope for initial release but should be considered in data model design:

- **Link practice to game**: "This practice prepares for Saturday's match against FC Espoo." The `PracticeSession` could have an optional `relatedGameId` field (not implemented, just reserved).
- **Shared cloud account**: A coach using both apps in cloud mode accesses the same players, teams, and seasons. This works naturally if both apps use the same Supabase project and same `players`/`teams`/`seasons` tables.
- **Cross-app statistics**: "This season: 24 games played, 45 practices held, 82% average attendance." Requires both apps to share a season entity and a reporting layer.

---

## 8. Screens Overview

Every screen the app needs, organized by navigation structure.

### Primary Navigation (Bottom Tab Bar / Sidebar)

| Screen | Route | Description |
|--------|-------|-------------|
| **Home / Dashboard** | `/` | Today's practices, upcoming sessions, quick stats (practices this week, attendance trend), quick actions (New Practice, New Exercise) |
| **Practice Sessions** | `/practice` | List of all practice sessions, filterable by date range, team, season, status. Sort by date (newest first). |
| **Exercise Library** | `/exercises` | Browseable/searchable list of all exercises. Grid or list view. Filter by category, tags, age group, intensity, favorites. |
| **Calendar** | `/calendar` | Month view with practice dots. Tap date to see sessions. Week view available. |
| **Roster** | `/roster` | Player list grouped by team. Tap player for detail view with attendance stats. |

### Detail / Editor Screens

| Screen | Route | Description |
|--------|-------|-------------|
| **Practice Editor** | `/practice/[id]` | The main planning screen. Block timeline on the left/top, block detail editor on the right/bottom. Editable title, date, theme, objectives. Attendance section. Reflection section (for completed sessions). |
| **Practice View (On-Field)** | `/practice/[id]?mode=field` | Simplified read-only view for use during practice. Large text, swipeable blocks, coaching points and field diagram prominent. |
| **Exercise Detail/Editor** | `/exercises/[id]` | Full exercise editor: form fields + field diagram canvas. Read-only when viewing someone else's shared exercise (future). |
| **Exercise Picker** | (Modal from Practice Editor) | Modal overlay for browsing/searching exercises when adding a block to a practice session. Shows exercise name, category, duration, thumbnail of field diagram. |

### Management Screens

| Screen | Route | Description |
|--------|-------|-------------|
| **Templates** | `/templates` | List of saved practice templates. Tap to view structure. "Use Template" creates a new session from it. |
| **Team Management** | `/roster?tab=teams` | Create/edit teams, assign players to teams. Same tab or route as roster. |
| **Season Management** | `/settings?tab=seasons` | Create/edit seasons. Simpler than MatchOps Game (no tournament series). |
| **Personnel** | `/settings?tab=personnel` | Manage coaching staff. Same UI pattern as MatchOps Game. |
| **Settings** | `/settings` | Language (fi/en), data mode (local/cloud), export/import data, about page, privacy policy link, terms link. |

### Auth Screens

| Screen | Route | Description |
|--------|-------|-------------|
| **Welcome / Onboarding** | (First launch only) | App branding, mode selection (local/cloud), brief feature overview. |
| **Login** | `/auth/login` | Email + password. Link to signup and forgot password. |
| **Signup** | `/auth/signup` | Email + password + confirm password. Link to login. |
| **Forgot Password** | `/auth/forgot-password` | Email input, sends reset link. |
| **Verify Email** | `/auth/verify` | Confirmation screen after signup. |

### Total Screen Count

- 5 primary navigation destinations
- 4 detail/editor screens (including modals)
- 4 management screens (most are tabs within existing routes)
- 5 auth/onboarding screens
- **~18 distinct screens** (many share routes via tabs or query parameters)

---

## 9. Offline-First Behavior

The app is designed to work without any network connection. Cloud sync is an optional upgrade, not a requirement.

### What Works Offline (Everything)

| Feature | Offline Behavior |
|---------|-----------------|
| Create/edit exercises | Saved to IndexedDB immediately |
| Create/edit practice sessions | Saved to IndexedDB immediately |
| Field diagram editor | Fully client-side, no network needed |
| Attendance tracking | Saved to IndexedDB immediately |
| Templates | Saved to IndexedDB immediately |
| Search and filter | All data is local, search is instant |
| Calendar view | All data is local |
| Export to PDF | Client-side rendering, no network needed |
| Export to Excel | Client-side rendering, no network needed |

### What Requires Network (Minimal)

| Feature | Requires Network |
|---------|-----------------|
| Cloud sync | Yes — syncing data to/from Supabase |
| Share link | Yes — generates a cloud-hosted read-only link |
| Account creation / login | Yes — Supabase Auth requires network |
| Password reset | Yes — sends email via Supabase |

### Cloud Sync Behavior

Same model as MatchOps Game (see `09-sync-engine.md`):

- **Cloud mode is online-only for writes**: If the network is unavailable, write operations show a clear error message: "Cannot save while offline. Switch to local mode for offline work."
- **No offline queue in cloud mode**: This is an intentional simplification. Users who need offline access should use local mode.
- **Data migration**: Users can migrate data between local and cloud mode at any time (same migration service pattern as MatchOps Game).

---

## 10. Metrics for Success

How to know the app is achieving its goals. These are not analytics metrics to instrument — they are design benchmarks to evaluate during testing and user feedback.

### Efficiency Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Plan a 60-minute practice session | Under 5 minutes | User testing: time from "New Practice" to "Save" with 5-6 blocks |
| Plan a session from template | Under 2 minutes | User testing: time from "New from Template" to "Save" with minor adjustments |
| Create a new exercise with field diagram | Under 3 minutes | User testing: simple exercise with 6 markers, 4 cones, 2 arrows |
| Take attendance for 16 players | Under 30 seconds | User testing: mark 2 absent, 1 late, rest present |
| Find a specific exercise in a library of 50+ | Under 10 seconds | User testing: search by name or filter by category |

### Growth Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Exercise library size | 50+ exercises | After one full season (6-8 months) |
| Template usage rate | 70%+ of sessions created from templates | After first month of regular use |
| Attendance tracking adoption | 90%+ of completed sessions have attendance | After first month |
| Reflection completion | 50%+ of completed sessions have at least one reflection field filled | After first month |

### Reliability Metrics

| Metric | Target |
|--------|--------|
| Data loss incidents | 0 (zero tolerance) |
| Offline functionality | 100% of features work without network (except cloud sync and sharing) |
| App crash rate | < 0.1% of sessions |
| Load time (cold start) | < 3 seconds on mid-range Android device |
| Field diagram rendering | < 500ms for a diagram with 20 markers and 10 arrows |

### User Satisfaction Signals

- Coach voluntarily builds their exercise library (not just using templates)
- Coach uses the app on the field during practice (not just for planning)
- Coach shares printed plans with assistant coaches
- Coach uses the reflection feature to improve future sessions
- Coach recommends the app to other coaches at the club

---

## Summary: The One-Sentence Version

MatchOps Practice helps youth soccer coaches create visual exercise diagrams, assemble them into practice sessions with station rotation support, and output a glanceable Practice Card that coaches share with their staff and reference on the field — all offline-first, with optional cloud sync.
