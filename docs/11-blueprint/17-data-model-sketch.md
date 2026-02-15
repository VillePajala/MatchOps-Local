# 17. Data Model Sketch — Practice Planning App

> **Audience**: AI agent building the new app
> **Purpose**: Entity design for a soccer practice planning application, modeled after MatchOps-Local's architecture but with practice-specific domain

---

## Design Philosophy

This data model follows the same principles as MatchOps-Local:
- **Local-first**: All entities stored in IndexedDB, optionally synced to Supabase
- **Single-user**: One coach per account, no multi-user collaboration
- **Offline-capable**: Full functionality without network
- **Reusable entities**: Exercises are a library, practices reference them

The relationship pattern mirrors MatchOps-Local:
- `Exercise` is to this app what `Player` is to MatchOps — a reusable entity managed in a library
- `PracticeSession` is to this app what `Game` is to MatchOps — the main working document
- `PracticeBlock` is to this app what `GameEvent` is to MatchOps — ordered child records within a session

---

## Entity Definitions

### PracticeSession (Primary Document)

The main working document. Equivalent to `Game` in MatchOps-Local.

```typescript
interface PracticeSession {
  // Identity
  id: string;                  // UUID, generated client-side
  userId?: string;             // Set in cloud mode, omitted in local

  // Core fields
  title: string;               // "Tuesday Technical Training"
  date: string;                // ISO date "2026-03-15"
  startTime: string;           // "17:00" (24h format)
  totalDurationMinutes: number; // Calculated from blocks, or manual override
  location: string;            // Free text

  // Context
  teamId: string;              // References Team
  seasonId: string;            // References Season
  ageGroup: string;            // "U12", "U14", etc.

  // Planning
  theme: string;               // Training theme: "Build-up play", "1v1 defending"
  objectives: string[];        // Specific session objectives
  equipmentNeeded: EquipmentItem[]; // Aggregated from blocks, or manual additions

  // Status & Reflection
  status: 'draft' | 'planned' | 'completed';
  coachReflection: string;     // Post-practice notes (filled after session)
  whatWorked: string;          // Post-practice: what went well
  whatToImprove: string;       // Post-practice: what to improve next time
  playerNotes: PlayerNote[];   // Per-player observations from this session

  // Metadata
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'windy' | 'cold' | 'indoor';
  fieldCondition?: 'good' | 'wet' | 'frozen' | 'artificial';
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp

  // Personnel
  coaches: string[];           // Personnel IDs (who coached this session)

  // Child data (embedded in local, separate table in Supabase)
  blocks: PracticeBlock[];     // Ordered list of practice blocks
  attendance: AttendanceRecord[]; // Who attended
}

interface PlayerNote {
  playerId: string;
  note: string;
}

interface EquipmentItem {
  type: 'cone' | 'ball' | 'bib' | 'goal' | 'pole' | 'ladder' | 'hurdle' | 'marker' | 'other';
  quantity: number;
  color?: string;              // For cones/bibs
  notes?: string;              // "small goals" vs "full size"
}
```

### PracticeBlock (Ordered Child of PracticeSession)

A time slot within a practice session. Equivalent to `GameEvent` in MatchOps-Local.

A block can be either an **activity** (everyone does the same thing) or **stations** (parallel exercises with group rotation). This supports both simple sequential practices and the common station rotation pattern where coaches each run a station and player groups cycle through.

```typescript
interface PracticeBlock {
  id: string;                  // UUID
  orderIndex: number;          // Position in the session (0, 1, 2, ...)

  // Phase classification
  phase: 'warmup' | 'main' | 'cooldown' | 'transition' | 'break';

  // Block organization type
  type: 'activity' | 'stations'; // Single activity vs parallel stations

  // === For type: 'activity' (everyone together) ===
  // Exercise reference (nullable — can be a free-form block)
  exerciseId: string | null;   // References Exercise library, null = custom/ad-hoc

  // Timing
  durationMinutes: number;     // How long this block runs

  // Session-specific overrides (when using a library exercise)
  customTitle?: string;        // Override exercise name for this session
  customDescription?: string;  // Override/supplement exercise description
  coachingFocus: string;       // What to emphasize THIS time
  adjustedPlayerCount?: number; // Different from exercise default
  intensity?: 'low' | 'medium' | 'high'; // Override exercise default
  notes: string;               // Free-form notes for this block

  // Field diagram override
  fieldDiagramOverride?: FieldDiagram; // Modified setup for this specific session

  // === For type: 'stations' (parallel exercises) ===
  stations?: Station[];        // 2-4 stations, each with its own exercise and coach
  rotationMinutes?: number;    // How long each group spends at each station
  numberOfGroups?: number;     // Auto-calculated from stations.length, but overridable
}
```

### Station (Parallel Exercise within a Stations Block)

A single station in a station rotation block. Each station has one exercise, one or more coaches, and runs in parallel with other stations.

```typescript
interface Station {
  id: string;                  // UUID
  orderIndex: number;          // Position within the block (0, 1, 2, ...)
  label: string;               // "Station A", "Passing station", etc.

  // Exercise
  exerciseId: string | null;   // References Exercise library, null = custom
  customTitle?: string;        // Override or custom exercise name
  customDescription?: string;  // Override or custom description
  coachingFocus?: string;      // Station-specific emphasis

  // Coach assignment
  coachIds: string[];          // Personnel IDs of coaches at this station

  // Visual
  fieldDiagramOverride?: FieldDiagram; // Modified diagram for this station/session

  // Notes
  notes: string;               // Station-specific notes
}
```

**Station rotation flow**:
- A stations block with 3 stations and `rotationMinutes: 12` runs for 36 minutes total (3 rotations × 12 min)
- The total block `durationMinutes` is calculated as `stations.length × rotationMinutes`
- Coaches stay at their station — player groups rotate
- The Practice Card shows all stations side-by-side in the grid

### Exercise (Library Item)

Reusable exercise definition. Equivalent to `Player` in MatchOps-Local — managed in a library, referenced by practice sessions.

```typescript
interface Exercise {
  // Identity
  id: string;                  // UUID
  userId?: string;             // Set in cloud mode

  // Core fields
  name: string;                // "Rondo 4v2"
  description: string;         // Detailed description of the exercise

  // Classification
  category: ExerciseCategory;
  subcategory?: string;        // Free text: "passing", "shooting", "pressing"
  tags: string[];              // Free-form tags for search/filter

  // Parameters
  durationMinutes: number;     // Default duration
  intensity: 'low' | 'medium' | 'high';
  playerCountMin: number;      // Minimum players needed
  playerCountMax: number;      // Maximum players (0 = unlimited)
  ageGroupSuitability: string[]; // ["U10", "U12", "U14", "U16", "adult"]

  // Content
  coachingPoints: string[];    // Key coaching points (ordered)
  equipment: EquipmentItem[];  // Required equipment
  variations: ExerciseVariation[]; // Alternative versions
  progressions: string[];      // How to make harder/easier

  // Visual
  fieldSetup: FieldDiagram;    // The visual diagram

  // User metadata
  isFavorite: boolean;
  source: 'user' | 'template'; // User-created or from template library
  createdAt: string;
  updatedAt: string;
}

type ExerciseCategory =
  | 'warmup'         // Dynamic stretching, activation
  | 'technical'      // Ball mastery, passing, receiving, shooting
  | 'tactical'       // Positional play, pressing triggers, build-up
  | 'physical'       // Conditioning, speed, agility
  | 'smallSidedGame' // SSGs, modified games
  | 'cooldown'       // Cool-down, static stretching
  | 'rondo'          // Possession circles/grids
  | 'setPiece'       // Corners, free kicks, throw-ins
  | 'goalkeeping'    // GK-specific drills
  | 'other';

interface ExerciseVariation {
  id: string;
  name: string;                // "With 2-touch limit"
  description: string;
}
```

### FieldDiagram (Visual Exercise Setup)

The interactive canvas for exercise visualization. Equivalent to the `SoccerField` tactical board in MatchOps-Local.

```typescript
interface FieldDiagram {
  // Field configuration
  fieldType: 'full' | 'half' | 'quarter' | 'thirdWidth' | 'custom';
  fieldDimensions?: {          // Only for 'custom'
    width: number;             // meters
    height: number;
  };
  orientation: 'landscape' | 'portrait'; // How to display

  // Objects on the field
  playerMarkers: PlayerMarker[];
  equipmentMarkers: EquipmentMarker[];
  movements: MovementArrow[];
  zones: HighlightZone[];
  textLabels: TextAnnotation[];
  ballPosition?: { relX: number; relY: number }; // 0-1 relative coords
}

interface PlayerMarker {
  id: string;
  relX: number;                // 0-1 relative X position
  relY: number;                // 0-1 relative Y position
  team: 'A' | 'B' | 'neutral'; // Color coding (attackers vs defenders vs neutral)
  label?: string;              // "GK", "1", "A1", etc.
  role?: string;               // "attacker", "defender", "neutral"
}

interface EquipmentMarker {
  id: string;
  type: 'cone' | 'pole' | 'goal_small' | 'goal_full' | 'ladder' | 'hurdle' | 'marker';
  relX: number;
  relY: number;
  color?: string;              // Cone/marker color
  rotation?: number;           // Degrees, for goals etc.
}

interface MovementArrow {
  id: string;
  type: 'run' | 'pass' | 'dribble' | 'shot' | 'movement'; // Arrow style
  points: { relX: number; relY: number }[]; // Start → waypoints → end
  color?: string;
  dashed?: boolean;            // Dashed = optional/alternative
}

interface HighlightZone {
  id: string;
  type: 'rectangle' | 'circle';
  relX: number;                // Center X
  relY: number;                // Center Y
  width: number;               // Relative width (for rectangle)
  height: number;              // Relative height (for rectangle)
  radius?: number;             // For circle
  color: string;               // Semi-transparent fill
  label?: string;
}

interface TextAnnotation {
  id: string;
  relX: number;
  relY: number;
  text: string;
  fontSize?: 'small' | 'medium' | 'large';
}
```

### PracticeTemplate (Reusable Plan Skeleton)

Saved practice plan templates. No direct equivalent in MatchOps-Local.

```typescript
interface PracticeTemplate {
  id: string;
  userId?: string;

  name: string;                // "Standard Tuesday Training"
  description: string;
  targetAgeGroup: string;      // "U12"
  targetDurationMinutes: number;
  theme: string;

  // Template blocks (exerciseId can be null = "placeholder")
  blocks: TemplateBlock[];

  tags: string[];
  isFavorite: boolean;
  source: 'user' | 'template';
  createdAt: string;
  updatedAt: string;
}

interface TemplateBlock {
  id: string;
  orderIndex: number;
  phase: 'warmup' | 'main' | 'cooldown' | 'transition' | 'break';
  type: 'activity' | 'stations'; // Same as PracticeBlock
  exerciseId: string | null;   // null = "pick any warmup exercise" (for type='activity')
  durationMinutes: number;
  notes: string;
  phaseLabel?: string;         // "Insert technical drill here"
  // For type='stations' templates
  stationTemplates?: TemplateStation[];
  rotationMinutes?: number;
}

interface TemplateStation {
  id: string;
  orderIndex: number;
  label: string;               // "Station A"
  exerciseId: string | null;   // null = placeholder
  notes: string;
}
```

### AttendanceRecord (Per-Session Player Tracking)

```typescript
interface AttendanceRecord {
  playerId: string;            // References Player
  status: 'present' | 'absent' | 'late' | 'injured' | 'excused';
  arrivalTime?: string;        // For late players: "17:15"
  notes?: string;              // "Left early - knee pain"
}
```

### Shared Entities (Adapted from MatchOps-Local)

These entities are adapted for the practice planning domain. The core shapes are based on MatchOps-Local but simplified or extended for this context. Refer to MatchOps-Local's `src/types/index.ts` for the full definitions.

```typescript
// Player — adapted for practice planning
// MatchOps-Local Player also includes: nickname, relX, relY, color, isGoalie,
// receivedFairPlayCard, createdAt, updatedAt. Include what the practice app needs.
interface Player {
  id: string;
  name: string;
  nickname?: string;             // Display name on field diagrams
  jerseyNumber?: string;         // Optional in MatchOps-Local
  isGoalie?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Team — adapted for practice planning
// MatchOps-Local Team also includes: color, ageGroup, notes, createdAt,
// updatedAt, archived. Include what the practice app needs.
interface Team {
  id: string;
  name: string;
  gameType?: 'soccer' | 'futsal'; // Optional in MatchOps-Local
  boundSeasonId?: string;
  boundTournamentId?: string;
  boundTournamentSeriesId?: string;
  ageGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Season — adapted for practice planning
// MatchOps-Local Season also includes: location, periodCount, periodDuration,
// gameDates, archived, notes, color, badge, customLeagueName, teamPlacements,
// gender, clubSeason, createdAt, updatedAt. Most fields are optional.
interface Season {
  id: string;
  name: string;
  startDate?: string;            // Optional in MatchOps-Local
  endDate?: string;              // Optional in MatchOps-Local
  gameType?: 'soccer' | 'futsal'; // Optional in MatchOps-Local
  gender?: string;               // Optional in MatchOps-Local
  ageGroup?: string;             // Optional in MatchOps-Local
  clubSeason?: string;
  leagueId?: string;
}

// Personnel — same as MatchOps-Local (this one is complete)
interface Personnel {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  certifications: string[];
  notes?: string;
}

// AppSettings — mostly the same, adapt field names
interface AppSettings {
  language: 'fi' | 'en';
  theme: 'dark' | 'light';     // Future: theme support
  defaultAgeGroup?: string;
  defaultTeamId?: string;
  // Remove game-specific settings (periodDuration, etc.)
  // Add practice-specific defaults:
  defaultPracticeDuration?: number;  // e.g. 90 minutes
  defaultFieldType?: 'full' | 'half' | 'quarter';
}
```

---

## Entity Relationship Diagram

```
Season ─────1:N────▶ PracticeSession ─────1:N────▶ PracticeBlock
  │                       │                              │
  │                       │                              ├── type:'activity' ──▶ Exercise ◄── FieldDiagram (1:1)
  │                       │                              │                          ▲
  │                       │                              └── type:'stations' ──1:N──▶ Station ──N:1──┘
  │                       │                                                            │
  │                       │                                                            └──N:N──▶ Personnel
  │                       │
  │                       ├─────1:N────▶ AttendanceRecord
  │                       │                    │
  │                       │                    │ N:1
  │                       │                    ▼
  └───1:N───▶ Team ──1:N──┼──────────▶ Player
                          │
                          └─────N:N────▶ Personnel (session-level coaches)


PracticeTemplate ────1:N────▶ TemplateBlock
                                   │ N:1 (optional)
                                   ▼
                              Exercise
```

### Key Relationships Explained

| Relationship | Cardinality | Notes |
|-------------|-------------|-------|
| Season → PracticeSession | 1:N | A season contains many practices |
| PracticeSession → PracticeBlock | 1:N (ordered) | Blocks have `orderIndex` for ordering |
| PracticeBlock → Exercise | N:1 (optional) | For `type: 'activity'` blocks — references a library exercise or is free-form |
| PracticeBlock → Station | 1:N (ordered) | For `type: 'stations'` blocks — 2-4 stations running in parallel |
| Station → Exercise | N:1 (optional) | Each station references a library exercise or is free-form |
| Station → Personnel | N:N | Coach(es) assigned to run this station |
| Exercise → FieldDiagram | 1:1 (embedded) | Each exercise has one diagram |
| PracticeSession → AttendanceRecord | 1:N | One record per player per session |
| AttendanceRecord → Player | N:1 | Links to roster |
| PracticeSession → Personnel | N:N | Session-level: which coaches are present |
| PracticeTemplate → TemplateBlock | 1:N (ordered) | Same as blocks but in template form |
| Team → Player | 1:N | Standard roster relationship |

---

## Supabase Schema Sketch

### Tables

```sql
-- Core tables (same as MatchOps-Local)
CREATE TABLE players (...);       -- Identical
CREATE TABLE teams (...);         -- Identical
CREATE TABLE seasons (...);       -- Identical
CREATE TABLE personnel (...);     -- Identical
CREATE TABLE app_settings (...);  -- Adapted
CREATE TABLE user_consents (...); -- Identical

-- New tables for practice planning
CREATE TABLE exercises (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,         -- exercise_category enum
  subcategory TEXT,
  tags TEXT[] DEFAULT '{}',
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  intensity TEXT DEFAULT 'medium',
  player_count_min INTEGER DEFAULT 1,
  player_count_max INTEGER DEFAULT 0,
  age_group_suitability TEXT[] DEFAULT '{}',
  coaching_points TEXT[] DEFAULT '{}',
  equipment JSONB DEFAULT '[]',   -- EquipmentItem[]
  variations JSONB DEFAULT '[]',  -- ExerciseVariation[]
  progressions TEXT[] DEFAULT '{}',
  field_setup JSONB DEFAULT '{}', -- FieldDiagram
  is_favorite BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)          -- No duplicate exercise names per user
);

CREATE TABLE practice_sessions (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME,
  total_duration_minutes INTEGER DEFAULT 90,
  location TEXT DEFAULT '',
  team_id text REFERENCES teams(id),
  season_id text REFERENCES seasons(id),
  age_group TEXT DEFAULT '',
  theme TEXT DEFAULT '',
  objectives TEXT[] DEFAULT '{}',
  equipment_needed JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',    -- 'draft' | 'planned' | 'completed'
  coach_reflection TEXT DEFAULT '',
  what_worked TEXT DEFAULT '',
  what_to_improve TEXT DEFAULT '',
  player_notes JSONB DEFAULT '[]',
  weather TEXT,
  field_condition TEXT,
  coaches TEXT[] DEFAULT '{}',    -- Personnel IDs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE practice_blocks (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  practice_session_id text NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  phase TEXT NOT NULL,            -- 'warmup' | 'main' | 'cooldown' | 'transition' | 'break'
  type TEXT NOT NULL DEFAULT 'activity', -- 'activity' | 'stations'
  exercise_id text REFERENCES exercises(id) ON DELETE SET NULL, -- For type='activity'
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  custom_title TEXT,
  custom_description TEXT,
  coaching_focus TEXT DEFAULT '',
  adjusted_player_count INTEGER,
  intensity TEXT,
  notes TEXT DEFAULT '',
  field_diagram_override JSONB,  -- FieldDiagram (override), for type='activity'
  rotation_minutes INTEGER,      -- For type='stations': minutes per rotation
  number_of_groups INTEGER,      -- For type='stations': number of rotating groups
  UNIQUE(user_id, practice_session_id, order_index)
);

CREATE TABLE stations (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  practice_block_id text NOT NULL REFERENCES practice_blocks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  label TEXT DEFAULT '',          -- "Station A", "Passing station"
  exercise_id text REFERENCES exercises(id) ON DELETE SET NULL,
  custom_title TEXT,
  custom_description TEXT,
  coaching_focus TEXT DEFAULT '',
  coach_ids TEXT[] DEFAULT '{}',  -- Personnel IDs
  notes TEXT DEFAULT '',
  field_diagram_override JSONB,  -- FieldDiagram (override)
  UNIQUE(user_id, practice_block_id, order_index)
);

CREATE TABLE attendance (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  practice_session_id text NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  arrival_time TIME,
  notes TEXT DEFAULT '',
  UNIQUE(user_id, practice_session_id, player_id)
);

CREATE TABLE practice_templates (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_age_group TEXT DEFAULT '',
  target_duration_minutes INTEGER DEFAULT 90,
  theme TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE template_blocks (
  id text PRIMARY KEY,            -- Generated client-side (local-first)
  user_id UUID NOT NULL REFERENCES auth.users(id),
  practice_template_id text NOT NULL REFERENCES practice_templates(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  phase TEXT NOT NULL,
  exercise_id text REFERENCES exercises(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  notes TEXT DEFAULT '',
  phase_label TEXT,
  UNIQUE(user_id, practice_template_id, order_index)
);
```

### RLS Policies (Same Pattern as MatchOps-Local)

```sql
-- Same pattern for ALL tables:
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own exercises"
  ON exercises FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Repeat for every table
```

### RPC Function: Save Practice with Relations

Same pattern as MatchOps-Local's `save_game_with_relations`:

```sql
CREATE OR REPLACE FUNCTION save_practice_with_relations(
  p_practice JSONB,
  p_blocks JSONB,
  p_stations JSONB,
  p_attendance JSONB
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_practice_id text;
BEGIN
  -- Upsert practice session
  v_practice_id := p_practice->>'id';

  INSERT INTO practice_sessions (id, user_id, title, date, ...)
  VALUES (v_practice_id, v_user_id, ...)
  ON CONFLICT (id) DO UPDATE SET ...;

  -- Delete old stations first (FK constraint: stations → practice_blocks)
  DELETE FROM stations
  WHERE practice_block_id IN (
    SELECT id FROM practice_blocks
    WHERE practice_session_id = v_practice_id AND user_id = v_user_id
  );

  -- Delete old blocks, insert new (same as game events pattern)
  DELETE FROM practice_blocks
  WHERE practice_session_id = v_practice_id AND user_id = v_user_id;

  INSERT INTO practice_blocks (...)
  SELECT ... FROM jsonb_array_elements(p_blocks);

  -- Insert new stations (for type='stations' blocks)
  INSERT INTO stations (...)
  SELECT ... FROM jsonb_array_elements(p_stations);

  -- Same for attendance
  DELETE FROM attendance
  WHERE practice_session_id = v_practice_id AND user_id = v_user_id;

  INSERT INTO attendance (...)
  SELECT ... FROM jsonb_array_elements(p_attendance);

  RETURN jsonb_build_object('success', true, 'id', v_practice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Transform Rules (App ↔ Database)

Following the same patterns as MatchOps-Local's 19 rules:

### Rule 1: Empty String ↔ NULL

Same pattern as MatchOps-Local. These fields use empty string in the app but NULL in Postgres:

```typescript
// Forward (App → DB): '' becomes null
location: session.location === '' ? null : session.location,
theme: session.theme === '' ? null : session.theme,
age_group: session.ageGroup === '' ? null : session.ageGroup,

// Reverse (DB → App): null becomes ''
location: session.location ?? '',
theme: session.theme ?? '',
ageGroup: session.age_group ?? '',
```

### Rule 2: Block Ordering via order_index

Same as MatchOps-Local's event ordering:

```typescript
// Forward: Array index becomes order_index
blocks: session.blocks.map((block, index) => ({
  ...transformBlock(block),
  order_index: index,
})),

// Reverse: Sort by order_index
blocks: dbBlocks
  .sort((a, b) => a.order_index - b.order_index)
  .map(transformBlockFromDb),
```

### Rule 3: JSONB Defaults

Same as MatchOps-Local's tactical JSONB:

```typescript
// Forward: Use ?? to preserve null but default undefined
equipment_needed: session.equipmentNeeded ?? [],
objectives: session.objectives ?? [],
player_notes: session.playerNotes ?? [],

// Reverse: Same
equipmentNeeded: session.equipment_needed ?? [],
```

### Rule 4: FieldDiagram as JSONB

The field diagram is stored as JSONB in both `exercises.field_setup` and `practice_blocks.field_diagram_override`:

```typescript
// Forward: JSONB columns accept objects directly — do NOT stringify
field_setup: exercise.fieldSetup as unknown as Json,

// Reverse: Cast back to application type
fieldSetup: exercise.field_setup as FieldDiagram,
```

### Rule 5: Station Ordering and Coach Assignment

Stations within a block follow the same ordering pattern:

```typescript
// Forward: Station array index becomes order_index
stations: block.stations?.map((station, index) => ({
  ...transformStation(station),
  order_index: index,
  practice_block_id: block.id,
})) ?? [],

// Reverse: Sort by order_index
stations: dbStations
  .sort((a, b) => a.order_index - b.order_index)
  .map(transformStationFromDb),

// Coach IDs are stored as TEXT[] (same as PracticeSession.coaches)
coach_ids: station.coachIds ?? [],
```

### Rule 6: Full-Save for Blocks and Stations (Same as Events)

When adding/removing/reordering blocks or stations, save the ENTIRE practice session:

```typescript
async reorderBlocks(sessionId: string, newOrder: string[]): Promise<void> {
  const session = await this.getPracticeSession(sessionId);
  session.blocks = newOrder.map((blockId, index) => ({
    ...session.blocks.find(b => b.id === blockId)!,
    orderIndex: index,
  }));
  return this.savePracticeSession(sessionId, session);
}
```

The RPC function deletes all stations before deleting blocks (FK constraint), then re-inserts both. This ensures station order_index stays contiguous.

---

## Features Matrix

| Feature | Primary Entities | UI Pattern |
|---------|-----------------|------------|
| Practice planning (build session) | PracticeSession + PracticeBlock | Block editor with activity/stations toggle |
| Station rotation (parallel exercises) | PracticeBlock (type='stations') + Station | Station grid within a block, coach assignment |
| **Practice Card** (glanceable overview) | PracticeSession (rendered view) | Grid of exercise cells with mini field diagrams |
| Exercise library (browse/search) | Exercise | List/grid with filters |
| Exercise editor (create/edit) | Exercise + FieldDiagram | Form + interactive canvas |
| **Field diagram editor** | FieldDiagram | Interactive canvas (like SoccerField) |
| Practice templates | PracticeTemplate + TemplateBlock | Same as practice editor |
| Attendance tracking | AttendanceRecord + Player | Checklist per session |
| Post-practice reflection | PracticeSession (reflection fields) | Form within completed session |
| Calendar view | PracticeSession (by date) | Month/week calendar |
| Season planning | Season + PracticeSession | Calendar + statistics |
| Equipment checklist | EquipmentItem (aggregated) | Auto-generated from blocks + stations |
| Player attendance stats | AttendanceRecord (aggregated) | Table/chart per player |
| Exercise usage stats | PracticeBlock/Station exerciseId (aggregated) | Chart of most-used exercises |
| Share Practice Card (screenshot) | PracticeSession → render → OS share | Image export via share sheet |
| Export practice plan (PDF) | PracticeSession → render | Print/PDF generation |
| Copy previous practice | PracticeSession → clone | Duplicate with new date |
| Import from template | PracticeTemplate → PracticeSession | Template picker + create |

---

## DataStore Interface (Domain-Split)

Unlike MatchOps-Local's monolithic `DataStore`, split by domain:

```typescript
// src/interfaces/stores/PlayerStore.ts
interface PlayerStore {
  getPlayers(): Promise<Player[]>;
  getPlayerById(id: string): Promise<Player | null>;
  savePlayer(player: Player): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
}

// src/interfaces/stores/ExerciseStore.ts
interface ExerciseStore {
  getExercises(): Promise<Exercise[]>;
  getExerciseById(id: string): Promise<Exercise | null>;
  saveExercise(exercise: Exercise): Promise<Exercise>;
  deleteExercise(id: string): Promise<void>;
  searchExercises(query: ExerciseQuery): Promise<Exercise[]>;
  toggleFavorite(id: string): Promise<void>;
}

// src/interfaces/stores/PracticeStore.ts
interface PracticeStore {
  getPracticeSessions(): Promise<PracticeSession[]>;
  getPracticeSessionById(id: string): Promise<PracticeSession | null>;
  getPracticeSessionsByDateRange(start: string, end: string): Promise<PracticeSession[]>;
  savePracticeSession(id: string, session: PracticeSession): Promise<PracticeSession>;
  deletePracticeSession(id: string): Promise<void>;
  duplicatePracticeSession(id: string, newDate: string): Promise<PracticeSession>;
}

// src/interfaces/stores/TemplateStore.ts
interface TemplateStore {
  getTemplates(): Promise<PracticeTemplate[]>;
  getTemplateById(id: string): Promise<PracticeTemplate | null>;
  saveTemplate(template: PracticeTemplate): Promise<PracticeTemplate>;
  deleteTemplate(id: string): Promise<void>;
  createSessionFromTemplate(templateId: string, date: string): Promise<PracticeSession>;
}

// src/interfaces/stores/AttendanceStore.ts
interface AttendanceStore {
  getAttendance(sessionId: string): Promise<AttendanceRecord[]>;
  saveAttendance(sessionId: string, records: AttendanceRecord[]): Promise<void>;
  getPlayerAttendanceStats(playerId: string): Promise<AttendanceStats>;
}

// src/interfaces/DataStore.ts — composition root
interface DataStore extends
  PlayerStore,
  ExerciseStore,
  PracticeStore,
  TemplateStore,
  AttendanceStore,
  TeamStore,
  SeasonStore,
  PersonnelStore,
  SettingsStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

This split means:
- Each domain store: ~200-400 lines of implementation (not 2600-4700)
- Each domain store: independently testable
- Adding a new entity type: add a new store interface, not modify a god interface

---

## Migration Path from MatchOps-Local

### Files to copy as-is (adapt imports)
- Auth layer: `AuthService`, `SupabaseAuthService`, `LocalAuthService`, `AuthProvider`
- Contexts: `ToastProvider`, `PremiumContext`, `SubscriptionContext`
- Utils: `retry.ts`, `transientErrors.ts`, `logger.ts`, `idGenerator.ts`, `contactValidation.ts`
- Supabase: `client.ts`, Edge Function patterns
- PWA: `sw.js`, `InstallPrompt`, `UpdateBanner`, `ServiceWorkerRegistration`
- i18n: `i18n.ts`, `I18nInitializer`, type generation script
- Config: `backendConfig.ts`, `queryKeys.ts` (adapt keys)
- Testing: `setupTests.mjs`, fixture factory pattern

### Files to adapt (change domain logic)
- `DataStore` interface → domain-split version above
- `LocalDataStore` → split into domain stores
- `SupabaseDataStore` → split into domain stores
- `SyncedDataStore` → same pattern, different entities
- `SyncEngine` / `SyncQueue` → same logic, different entity types
- `factory.ts` → same pattern
- Page orchestrator → route-based (not single-page)

### Files to build new
- Practice editor UI (timeline, block editor)
- Exercise library UI (browser, search, filters)
- Field diagram editor (interactive canvas — similar to SoccerField but for diagrams)
- Calendar view
- Attendance UI
- Template system

---

## Open Questions for Implementation

1. **Practice Card rendering**: How to render the grid of exercise cells with mini field diagrams? Options: HTML/CSS grid with SVG diagrams (simplest), canvas rendering (more control), or a hybrid. Must work for screenshot sharing via OS share sheet.
2. **Field diagram complexity**: How sophisticated should the diagram editor be at launch? Start with player markers + cones + arrows, add zones/text later?
3. **Station rotation UX**: How to make the station setup flow fast? Inline editing within the block, or a dedicated "station builder" view?
4. **Exercise sharing format**: When app-link sharing is implemented (future), what is the URL format? Deep link to a specific practice session? Requires cloud mode or a sharing service.
5. **Practice template library**: Pre-built templates in the app, or only user-created?
6. **Calendar integration**: Export to Google Calendar / iCal?
7. **Drill animation**: Future feature — animate player movements on the diagram?
