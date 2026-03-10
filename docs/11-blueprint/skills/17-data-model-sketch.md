# 17. Data Model Sketch — MatchOps Skills

> **Audience**: AI agent building the new app
> **Purpose**: Entity design for a gamified kids' soccer skills app. Cloud-first architecture (no dual-mode).

---

## Design Philosophy

This data model differs from MatchOps Game/Practice in key ways:

- **Cloud-first**: All data in Supabase. No LocalDataStore. React Query provides caching.
- **Parent-owned**: Parent's Supabase Auth account owns all data. Child profiles are rows, not accounts.
- **Content + Progress split**: Challenges are read-only content (seeded by us). Progress is user-generated data.
- **COPPA-safe**: No personal information collected from children. Display names and avatars only.

### Entity Relationship Overview

```
Parent Account (auth.users)
  └── 1:N ──> ChildProfile
                  ├── 1:N ──> ChallengeCompletion
                  ├── 1:N ──> ChallengeMastery (aggregated per challenge)
                  ├── 1:1 ──> ProgressStats (computed/cached)
                  ├── 1:N ──> EarnedBadge
                  └── 1:N ──> DailyQuestLog

Challenge (read-only content, seeded)
  ├── N:1 ──> ChallengeCategory
  └── N:1 ──> Challenge (self-ref: prerequisiteChallengeId for skill paths)

BadgeDefinition (read-only content, seeded)
```

---

## Entity Definitions

### ChildProfile

A child using the app. NOT a Supabase Auth user — just a row owned by the parent.

```typescript
interface ChildProfile {
  id: string;                  // UUID, generated client-side
  userId: string;              // Parent's auth.users ID
  displayName: string;         // "SuperStriker99" — NOT a real name
  avatarId: string;            // References a pre-made avatar (e.g., "avatar_fox_01")
  ageGroup: 'u8' | 'u11' | 'u14'; // Determines content difficulty
  positionInterest?: 'all-around' | 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

  // Equipment preferences (what the kid has available)
  availableEquipment: EquipmentType[]; // e.g., ['ball', 'cones'] — filters quests and library

  // Gamification state
  xp: number;                  // Total XP earned (ever)
  level: number;               // Current level (computed from XP, but cached)
  currentStreak: number;       // Current consecutive days active
  longestStreak: number;       // All-time best streak
  lastActiveDate: string;      // ISO date of last challenge completion "2026-03-05"
  streakFreezeAvailable: boolean; // Can use one freeze this week
  streakFreezeUsedThisWeek: boolean;
  weekendModeEnabled: boolean; // If true, streaks only count weekdays (parent setting)

  // Stats
  totalChallengesCompleted: number;
  totalPracticeSessions: number; // Days where at least 1 challenge was completed

  // Active challenge (persisted locally, not in cloud — survives app restart)
  // Stored in local storage / React Query cache, NOT in this table
  // activeChallengeId?: string;  // Currently open challenge (local-only state)

  // Metadata
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
}
```

### Challenge (Content — Read-Only)

A skill challenge that kids can complete. These are **seeded by us** (not user-created). Stored in Supabase but cached aggressively by React Query.

```typescript
interface Challenge {
  id: string;                  // UUID
  categoryId: string;          // References ChallengeCategory

  // Content
  nameKey: string;             // i18n key: "challenges.ballMastery.toeTaps.name"
  descriptionKey: string;      // i18n key: "challenges.ballMastery.toeTaps.description"
  instructionsKey: string;     // i18n key: detailed how-to instructions
  successCriteriaKey: string;  // i18n key: "Do 20 toe taps without losing the ball"

  // Classification
  difficulty: 'bronze' | 'silver' | 'gold';
  ageGroups: ('u8' | 'u11' | 'u14')[]; // Which age groups this is suitable for
  tags: string[];              // Free-form tags for filtering

  // Parameters
  estimatedMinutes: number;    // How long this typically takes (5, 10, 15)
  xpReward: number;            // XP earned on completion (10, 25, 50)
  firstCompletionBonusXp: number; // Extra XP for first time (e.g., 15)
  equipment: EquipmentType[];  // What's needed
  requiresWall: boolean;       // Many passing drills need a wall
  indoorFriendly: boolean;     // Can be done indoors (hallway, gym)

  // Skill path (progression within a category)
  prerequisiteChallengeId?: string; // Complete this challenge first to "unlock" in the path
  pathOrder: number;           // Position in the category skill path (0 = entry point)

  // Mastery XP scaling
  masteryXpMultipliers: {      // XP multiplier after first completion
    silver: number;            // After 3 completions (default: 0.5 = 50% base XP)
    gold: number;              // After 10 completions (default: 0.25 = 25% base XP)
  };

  // Age-specific overrides (for u8 simplified instructions/criteria)
  successCriteriaKeyU8?: string; // Simplified success criteria for 6-8 year olds
  instructionsKeyU8?: string;    // Simplified instructions for 6-8 year olds

  // Media
  videoUrl?: string;           // Optional: short demo clip URL
  thumbnailUrl?: string;       // Challenge card thumbnail

  // Metadata
  sortOrder: number;           // Display order within category
  isActive: boolean;           // Can be deactivated without deleting
  isPremium: boolean;          // Requires premium subscription
  createdAt: string;
  updatedAt: string;
}

type EquipmentType = 'ball' | 'cones' | 'wall' | 'goal' | 'ladder' | 'marker' | 'none';
```

### ChallengeCategory

Grouping for challenges.

```typescript
interface ChallengeCategory {
  id: string;
  nameKey: string;             // i18n key: "categories.ballMastery"
  iconName: string;            // Icon identifier for the UI (e.g., "football", "target")
  color: string;               // Category accent color (hex)
  sortOrder: number;
  isActive: boolean;
}
```

**Predefined categories**: Ball Mastery, Dribbling, Passing, Shooting, Juggling, First Touch, Agility, Tricks

### ChallengeCompletion

Records that a child completed a specific challenge on a specific date.

```typescript
interface ChallengeCompletion {
  id: string;                  // UUID
  userId: string;              // Parent's auth ID (for RLS)
  childProfileId: string;      // Which child
  challengeId: string;         // Which challenge

  // Completion data
  completedAt: string;         // ISO timestamp
  completedDate: string;       // ISO date "2026-03-05" (for streak/daily calculations)

  // Optional self-report
  repsCompleted?: number;      // "How many did you do?"
  selfRating?: 'easy' | 'good' | 'hard'; // "How did it feel?"
  notes?: string;              // Free-form (kid's own notes)

  // Practice timer
  practiceMinutes?: number;    // Approximate practice duration (from local timer, rounded)

  // XP breakdown
  baseXpEarned: number;        // Challenge's base XP
  bonusXpEarned: number;       // First-completion bonus, streak bonus, etc.
  totalXpEarned: number;       // baseXp + bonusXp
}
```

### ChallengeMastery

Aggregated mastery progress per child per challenge. Updated on each completion.

```typescript
interface ChallengeMastery {
  id: string;                  // UUID
  userId: string;              // Parent's auth ID (for RLS)
  childProfileId: string;      // Which child
  challengeId: string;         // Which challenge

  completionCount: number;     // Total times completed
  masteryLevel: 'none' | 'bronze' | 'silver' | 'gold'; // Current mastery star
  firstCompletedAt: string;    // ISO timestamp of first completion
  lastCompletedAt: string;     // ISO timestamp of most recent completion
  bestSelfRating?: 'easy' | 'good' | 'hard'; // Best self-report
}
```

**Mastery thresholds**:
- `bronze`: 1 completion (first time)
- `silver`: 3 completions
- `gold`: 10 completions

**XP scaling**: After reaching a mastery level, subsequent completions earn reduced XP:
- Before silver (completions 1-2): full base XP + first-completion bonus on #1
- At/after silver (completions 3-9): 50% base XP
- At/after gold (completions 10+): 25% base XP

This table can be derived from `challenge_completions` via aggregation, but is cached as a materialized view or separate table for fast reads (the challenge library needs mastery stars for every card).

### DailyQuestLog

Tracks which daily quests were generated and whether they were completed.

```typescript
interface DailyQuestLog {
  id: string;                  // UUID
  userId: string;              // Parent's auth ID (for RLS)
  childProfileId: string;      // Which child
  questDate: string;           // ISO date "2026-03-05"

  // The three quests for the day
  easyQuestChallengeId: string;
  mainQuestChallengeId: string;
  bonusQuestChallengeId: string;

  // Completion status
  easyQuestCompleted: boolean;
  mainQuestCompleted: boolean;
  bonusQuestCompleted: boolean;
  allQuestsCompleted: boolean; // Triggers daily bonus XP
  dailyBonusXpEarned: number;  // 0 if not all completed

  createdAt: string;
}
```

### BadgeDefinition (Content — Read-Only)

Badge templates seeded by us.

```typescript
interface BadgeDefinition {
  id: string;                  // e.g., "streak_7_days"
  nameKey: string;             // i18n key: "badges.streakSevenDays.name"
  descriptionKey: string;      // i18n key: "badges.streakSevenDays.description"
  iconName: string;            // Badge icon identifier
  category: 'skill' | 'streak' | 'volume' | 'explorer' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';

  // Unlock criteria (evaluated in app logic)
  criteriaType: string;        // "streak_days" | "total_completions" | "category_complete" | etc.
  criteriaValue: number;       // e.g., 7 for "streak_days:7"
  criteriaCategory?: string;   // For category-specific badges: "ball_mastery"
  criteriaDifficulty?: string; // For difficulty-specific: "gold"

  sortOrder: number;
  isActive: boolean;
  isPremium: boolean;
}
```

### EarnedBadge

Records that a child earned a specific badge.

```typescript
interface EarnedBadge {
  id: string;                  // UUID
  userId: string;              // Parent's auth ID (for RLS)
  childProfileId: string;
  badgeDefinitionId: string;
  earnedAt: string;            // ISO timestamp
  seen: boolean;               // Has the kid seen the unlock animation?
}
```

### AppSettings

Parent-level app settings.

```typescript
interface AppSettings {
  userId: string;              // Parent's auth ID
  language: 'fi' | 'en';
  notificationsEnabled: boolean; // Push notification opt-in (parent decides)
  weeklyDigestEnabled: boolean;  // Weekly progress summary email/notification
  weeklyDigestDay: 'sunday' | 'monday'; // When to send the digest
  subscriptionTier: 'free' | 'premium';
  subscriptionExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## Supabase Schema

### Tables

```sql
-- ============================================================
-- PARENT & CHILD MANAGEMENT
-- ============================================================

CREATE TABLE child_profiles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_id TEXT NOT NULL DEFAULT 'avatar_default',
  age_group TEXT NOT NULL DEFAULT 'u11',  -- 'u8' | 'u11' | 'u14'
  position_interest TEXT,                 -- nullable
  available_equipment TEXT[] NOT NULL DEFAULT '{ball}', -- what the kid has

  -- Gamification state
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  streak_freeze_available BOOLEAN NOT NULL DEFAULT TRUE,
  streak_freeze_used_this_week BOOLEAN NOT NULL DEFAULT FALSE,
  weekend_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- streaks count weekdays only

  -- Stats
  total_challenges_completed INTEGER NOT NULL DEFAULT 0,
  total_practice_sessions INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, display_name)
);

-- ============================================================
-- CONTENT TABLES (seeded, read-only for users)
-- ============================================================

CREATE TABLE challenge_categories (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,               -- i18n key
  icon_name TEXT NOT NULL DEFAULT 'star',
  color TEXT NOT NULL DEFAULT '#10b981', -- emerald-500
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES challenge_categories(id),

  -- Content (i18n keys — actual text lives in translation files)
  name_key TEXT NOT NULL,
  description_key TEXT NOT NULL,
  instructions_key TEXT NOT NULL,
  success_criteria_key TEXT NOT NULL,

  -- Classification
  difficulty TEXT NOT NULL DEFAULT 'bronze', -- 'bronze' | 'silver' | 'gold'
  age_groups TEXT[] NOT NULL DEFAULT '{u8,u11,u14}',
  tags TEXT[] DEFAULT '{}',

  -- Parameters
  estimated_minutes INTEGER NOT NULL DEFAULT 10,
  xp_reward INTEGER NOT NULL DEFAULT 10,
  first_completion_bonus_xp INTEGER NOT NULL DEFAULT 15,
  equipment TEXT[] DEFAULT '{ball}',
  requires_wall BOOLEAN NOT NULL DEFAULT FALSE,
  indoor_friendly BOOLEAN NOT NULL DEFAULT FALSE,

  -- Skill path
  prerequisite_challenge_id TEXT REFERENCES challenges(id), -- previous challenge in path
  path_order INTEGER NOT NULL DEFAULT 0,                    -- position in category path

  -- Mastery XP scaling (multipliers after first completion)
  mastery_xp_silver NUMERIC(3,2) NOT NULL DEFAULT 0.50,    -- 50% base XP after 3 completions
  mastery_xp_gold NUMERIC(3,2) NOT NULL DEFAULT 0.25,      -- 25% base XP after 10 completions

  -- Age-specific content overrides (u8 simplified versions)
  success_criteria_key_u8 TEXT,  -- simplified for 6-8 year olds
  instructions_key_u8 TEXT,      -- simplified for 6-8 year olds

  -- Media
  video_url TEXT,
  thumbnail_url TEXT,

  -- Metadata
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROGRESS TABLES (user-generated)
-- ============================================================

CREATE TABLE challenge_completions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_profile_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),

  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Optional self-report
  reps_completed INTEGER,
  self_rating TEXT,              -- 'easy' | 'good' | 'hard'
  notes TEXT,

  -- Practice timer
  practice_minutes INTEGER,     -- approximate duration from local timer

  -- XP breakdown
  base_xp_earned INTEGER NOT NULL DEFAULT 0,
  bonus_xp_earned INTEGER NOT NULL DEFAULT 0,
  total_xp_earned INTEGER NOT NULL DEFAULT 0
);

-- Index for common queries
CREATE INDEX idx_completions_child_date
  ON challenge_completions(child_profile_id, completed_date);

CREATE INDEX idx_completions_child_challenge
  ON challenge_completions(child_profile_id, challenge_id);

CREATE TABLE challenge_mastery (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_profile_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),

  completion_count INTEGER NOT NULL DEFAULT 1,
  mastery_level TEXT NOT NULL DEFAULT 'bronze', -- 'bronze' | 'silver' | 'gold'
  first_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  best_self_rating TEXT,

  UNIQUE(child_profile_id, challenge_id) -- One mastery record per child per challenge
);

CREATE INDEX idx_mastery_child
  ON challenge_mastery(child_profile_id);

CREATE TABLE daily_quest_logs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_profile_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  quest_date DATE NOT NULL,

  easy_quest_challenge_id TEXT NOT NULL REFERENCES challenges(id),
  main_quest_challenge_id TEXT NOT NULL REFERENCES challenges(id),
  bonus_quest_challenge_id TEXT NOT NULL REFERENCES challenges(id),

  easy_quest_completed BOOLEAN NOT NULL DEFAULT FALSE,
  main_quest_completed BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_quest_completed BOOLEAN NOT NULL DEFAULT FALSE,
  all_quests_completed BOOLEAN NOT NULL DEFAULT FALSE,
  daily_bonus_xp_earned INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(child_profile_id, quest_date) -- One quest log per child per day
);

-- ============================================================
-- BADGES
-- ============================================================

CREATE TABLE badge_definitions (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  description_key TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'star',
  category TEXT NOT NULL DEFAULT 'volume',
  rarity TEXT NOT NULL DEFAULT 'common',

  criteria_type TEXT NOT NULL,        -- "streak_days", "total_completions", etc.
  criteria_value INTEGER NOT NULL,
  criteria_category TEXT,             -- For skill-specific badges
  criteria_difficulty TEXT,           -- For difficulty-specific badges

  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE earned_badges (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_profile_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  badge_definition_id TEXT NOT NULL REFERENCES badge_definitions(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen BOOLEAN NOT NULL DEFAULT FALSE,

  UNIQUE(child_profile_id, badge_definition_id) -- Can only earn each badge once
);

-- ============================================================
-- SETTINGS
-- ============================================================

CREATE TABLE app_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'fi',
  notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_digest_day TEXT NOT NULL DEFAULT 'sunday',
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS: Auto-update updated_at on all mutable tables
-- (Requires moddatetime extension: CREATE EXTENSION IF NOT EXISTS moddatetime;)
-- ============================================================

CREATE TRIGGER set_updated_at_child_profiles
  BEFORE UPDATE ON child_profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER set_updated_at_challenges
  BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER set_updated_at_app_settings
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- ============================================================
-- INDEXES: Performance for common queries
-- ============================================================

CREATE INDEX idx_earned_badges_child
  ON earned_badges(child_profile_id);

CREATE INDEX idx_completions_user
  ON challenge_completions(user_id);
```

### RLS Policies

```sql
-- Same pattern for ALL user-data tables:
-- Parent can only access their own data (and their children's data)

ALTER TABLE child_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own child profiles"
  ON child_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE challenge_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own completions"
  ON challenge_completions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE daily_quest_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own quest logs"
  ON daily_quest_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE challenge_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own mastery records"
  ON challenge_mastery FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE earned_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own badges"
  ON earned_badges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own settings"
  ON app_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Content tables: readable by ALL authenticated users (no write)
-- NOTE: Use auth.uid() IS NOT NULL instead of auth.role() = 'authenticated'
-- (auth.role() can behave unexpectedly with certain JWT configurations)
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Challenges are readable by all authenticated users"
  ON challenges FOR SELECT
  USING (auth.uid() IS NOT NULL);

ALTER TABLE challenge_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are readable by all authenticated users"
  ON challenge_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badge definitions are readable by all authenticated users"
  ON badge_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

### Key RPC Functions

#### Complete a Challenge (Atomic)

Completing a challenge must atomically: create completion record, update XP, update streak, check for new badges.

```sql
CREATE OR REPLACE FUNCTION complete_challenge(
  p_child_profile_id TEXT,
  p_challenge_id TEXT,
  p_reps_completed INTEGER DEFAULT NULL,
  p_self_rating TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_practice_minutes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_child child_profiles%ROWTYPE;
  v_challenge challenges%ROWTYPE;
  v_mastery challenge_mastery%ROWTYPE;
  v_is_first_completion BOOLEAN;
  v_completion_count INTEGER;
  v_mastery_level TEXT;
  v_base_xp INTEGER;
  v_bonus_xp INTEGER := 0;
  v_total_xp INTEGER;
  v_new_streak INTEGER;
  v_completion_id TEXT;
  v_today DATE := CURRENT_DATE;
  v_new_level INTEGER;
  v_new_badges JSONB := '[]'::JSONB;
  v_is_weekday BOOLEAN;
BEGIN
  -- Verify child belongs to this parent (FOR UPDATE prevents concurrent double-tap)
  SELECT * INTO v_child FROM child_profiles
    WHERE id = p_child_profile_id AND user_id = v_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Child profile not found';
  END IF;

  -- Get challenge details
  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  -- Get existing mastery record (if any)
  SELECT * INTO v_mastery FROM challenge_mastery
    WHERE child_profile_id = p_child_profile_id AND challenge_id = p_challenge_id;

  v_is_first_completion := NOT FOUND;
  v_completion_count := COALESCE(v_mastery.completion_count, 0) + 1;

  -- Determine new mastery level
  v_mastery_level := CASE
    WHEN v_completion_count >= 10 THEN 'gold'
    WHEN v_completion_count >= 3 THEN 'silver'
    ELSE 'bronze'
  END;

  -- Calculate XP with mastery scaling
  IF v_is_first_completion THEN
    v_base_xp := v_challenge.xp_reward;
    v_bonus_xp := v_bonus_xp + v_challenge.first_completion_bonus_xp;
  ELSIF v_completion_count >= 10 THEN
    v_base_xp := CEIL(v_challenge.xp_reward * v_challenge.mastery_xp_gold);
  ELSIF v_completion_count >= 3 THEN
    v_base_xp := CEIL(v_challenge.xp_reward * v_challenge.mastery_xp_silver);
  ELSE
    v_base_xp := v_challenge.xp_reward;
  END IF;

  -- Streak calculation (with weekend mode support)
  v_is_weekday := EXTRACT(DOW FROM v_today) BETWEEN 1 AND 5; -- Mon=1, Fri=5

  IF v_child.last_active_date = v_today THEN
    -- Already active today, streak unchanged
    v_new_streak := v_child.current_streak;
  ELSIF v_child.weekend_mode_enabled AND NOT v_is_weekday THEN
    -- Weekend mode: weekend completions don't affect streak or last_active_date (but still earn XP)
    v_new_streak := v_child.current_streak;
    -- NOTE: Skip last_active_date update below — see weekend mode guard in UPDATE
  ELSIF v_child.last_active_date = v_today - 1
    OR (v_child.weekend_mode_enabled
        AND EXTRACT(DOW FROM v_today) = 1  -- Monday
        AND v_child.last_active_date >= v_today - 3) THEN -- Last active Friday
    -- Consecutive day (or Monday after weekend in weekend mode)
    v_new_streak := v_child.current_streak + 1;
  ELSIF v_child.last_active_date = v_today - 2
    AND v_child.streak_freeze_available
    AND NOT v_child.streak_freeze_used_this_week THEN
    -- Missed yesterday but have freeze available
    v_new_streak := v_child.current_streak + 1;
    UPDATE child_profiles SET streak_freeze_used_this_week = TRUE
      WHERE id = p_child_profile_id;
  ELSE
    -- Streak broken
    v_new_streak := 1;
  END IF;

  -- Streak bonus XP (every 7 days)
  IF v_new_streak > 0 AND v_new_streak % 7 = 0 THEN
    v_bonus_xp := v_bonus_xp + 50; -- Weekly streak bonus
  END IF;

  v_total_xp := v_base_xp + v_bonus_xp;

  -- Calculate new level
  v_new_level := calculate_level(v_child.xp + v_total_xp);

  -- Create completion record
  v_completion_id := gen_random_uuid()::TEXT;
  INSERT INTO challenge_completions (
    id, user_id, child_profile_id, challenge_id,
    completed_date, reps_completed, self_rating, notes,
    practice_minutes,
    base_xp_earned, bonus_xp_earned, total_xp_earned
  ) VALUES (
    v_completion_id, v_user_id, p_child_profile_id, p_challenge_id,
    v_today, p_reps_completed, p_self_rating, p_notes,
    p_practice_minutes,
    v_base_xp, v_bonus_xp, v_total_xp
  );

  -- Upsert mastery record
  INSERT INTO challenge_mastery (
    id, user_id, child_profile_id, challenge_id,
    completion_count, mastery_level, first_completed_at, last_completed_at,
    best_self_rating
  ) VALUES (
    gen_random_uuid()::TEXT, v_user_id, p_child_profile_id, p_challenge_id,
    1, 'bronze', NOW(), NOW(), p_self_rating
  )
  ON CONFLICT (child_profile_id, challenge_id) DO UPDATE SET
    completion_count = challenge_mastery.completion_count + 1,
    mastery_level = v_mastery_level,
    last_completed_at = NOW(),
    best_self_rating = COALESCE(
      CASE WHEN p_self_rating = 'easy' THEN 'easy'
           WHEN challenge_mastery.best_self_rating = 'easy' THEN 'easy'
           WHEN p_self_rating = 'good' THEN 'good'
           WHEN challenge_mastery.best_self_rating = 'good' THEN 'good'
           ELSE p_self_rating END,
      challenge_mastery.best_self_rating
    );

  -- Update child profile
  UPDATE child_profiles SET
    xp = xp + v_total_xp,
    level = v_new_level,
    current_streak = v_new_streak,
    longest_streak = GREATEST(longest_streak, v_new_streak),
    -- In weekend mode, don't update last_active_date on weekends (preserves Monday streak check)
    last_active_date = CASE
      WHEN v_child.weekend_mode_enabled AND NOT v_is_weekday THEN last_active_date
      ELSE v_today
    END,
    total_challenges_completed = total_challenges_completed + 1,
    total_practice_sessions = CASE
      WHEN last_active_date < v_today THEN total_practice_sessions + 1
      ELSE total_practice_sessions
    END,
    updated_at = NOW()
  WHERE id = p_child_profile_id;

  -- Check and award new badges (simplified — real impl checks all criteria)
  -- This would call a helper function that evaluates badge criteria
  -- v_new_badges := check_and_award_badges(p_child_profile_id, v_new_streak, ...);

  RETURN jsonb_build_object(
    'completionId', v_completion_id,
    'xpEarned', v_total_xp,
    'baseXp', v_base_xp,
    'bonusXp', v_bonus_xp,
    'newLevel', v_new_level,
    'leveledUp', v_new_level > v_child.level,
    'streak', v_new_streak,
    'masteryLevel', v_mastery_level,
    'completionCount', v_completion_count,
    'isFirstCompletion', v_is_first_completion,
    'practiceMinutes', p_practice_minutes,
    'newBadges', v_new_badges
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restrict access: only authenticated users can call this RPC
REVOKE EXECUTE ON FUNCTION complete_challenge FROM public;
GRANT EXECUTE ON FUNCTION complete_challenge TO authenticated;
```

#### Calculate Level from XP

```sql
CREATE OR REPLACE FUNCTION calculate_level(p_xp INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_level INTEGER := 1;
  v_xp_for_next INTEGER := 100;  -- XP needed for level 2
  v_remaining INTEGER := p_xp;
BEGIN
  WHILE v_remaining >= v_xp_for_next LOOP
    v_remaining := v_remaining - v_xp_for_next;
    v_level := v_level + 1;
    -- Each level requires 50% more XP than the previous
    v_xp_for_next := CEIL(v_xp_for_next * 1.5);
  END LOOP;
  RETURN v_level;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

#### Generate Daily Quests

```sql
CREATE OR REPLACE FUNCTION generate_daily_quests(
  p_child_profile_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_child child_profiles%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_existing daily_quest_logs%ROWTYPE;
  v_easy_id TEXT;
  v_main_id TEXT;
  v_bonus_id TEXT;
  v_log_id TEXT;
BEGIN
  -- Check if quests already generated today
  SELECT * INTO v_existing FROM daily_quest_logs
    WHERE child_profile_id = p_child_profile_id AND quest_date = v_today;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'questLogId', v_existing.id,
      'easyQuest', v_existing.easy_quest_challenge_id,
      'mainQuest', v_existing.main_quest_challenge_id,
      'bonusQuest', v_existing.bonus_quest_challenge_id,
      'easyCompleted', v_existing.easy_quest_completed,
      'mainCompleted', v_existing.main_quest_completed,
      'bonusCompleted', v_existing.bonus_quest_completed
    );
  END IF;

  -- Get child profile for age group
  SELECT * INTO v_child FROM child_profiles
    WHERE id = p_child_profile_id AND user_id = v_user_id;

  -- Select quests using deterministic seed (date + child_id hash)
  -- Prefer challenges not yet gold-mastered, matching available equipment
  -- Easy: Bronze difficulty, matching age group
  SELECT c.id INTO v_easy_id FROM challenges c
    LEFT JOIN challenge_mastery cm
      ON cm.child_profile_id = p_child_profile_id AND cm.challenge_id = c.id
    WHERE c.difficulty = 'bronze'
    AND v_child.age_group = ANY(c.age_groups)
    AND c.is_active = TRUE
    AND (c.equipment <@ v_child.available_equipment OR c.equipment = '{ball}')
    ORDER BY
      -- Prefer non-gold-mastered challenges
      CASE WHEN cm.mastery_level = 'gold' THEN 1 ELSE 0 END,
      md5(v_today::TEXT || p_child_profile_id || c.id)
    LIMIT 1;

  -- Main: Silver difficulty, matching age group
  SELECT c.id INTO v_main_id FROM challenges c
    LEFT JOIN challenge_mastery cm
      ON cm.child_profile_id = p_child_profile_id AND cm.challenge_id = c.id
    WHERE c.difficulty = 'silver'
    AND v_child.age_group = ANY(c.age_groups)
    AND c.is_active = TRUE
    AND c.id != v_easy_id
    AND (c.equipment <@ v_child.available_equipment OR c.equipment = '{ball}')
    ORDER BY
      CASE WHEN cm.mastery_level = 'gold' THEN 1 ELSE 0 END,
      md5(v_today::TEXT || p_child_profile_id || c.id)
    LIMIT 1;

  -- Bonus: Gold or different category
  SELECT c.id INTO v_bonus_id FROM challenges c
    LEFT JOIN challenge_mastery cm
      ON cm.child_profile_id = p_child_profile_id AND cm.challenge_id = c.id
    WHERE (c.difficulty = 'gold' OR c.difficulty = 'silver')
    AND v_child.age_group = ANY(c.age_groups)
    AND c.is_active = TRUE
    AND c.id NOT IN (v_easy_id, v_main_id)
    AND (c.equipment <@ v_child.available_equipment OR c.equipment = '{ball}')
    ORDER BY
      CASE WHEN cm.mastery_level = 'gold' THEN 1 ELSE 0 END,
      md5(v_today::TEXT || p_child_profile_id || c.id)
    LIMIT 1;

  -- Fallback: if any quest slot is NULL (too few challenges for this difficulty),
  -- fill with any age-appropriate active challenge to avoid NOT NULL FK violation
  IF v_easy_id IS NULL OR v_main_id IS NULL OR v_bonus_id IS NULL THEN
    DECLARE v_fallback_id TEXT;
    BEGIN
      SELECT c.id INTO v_fallback_id FROM challenges c
        WHERE v_child.age_group = ANY(c.age_groups)
        AND c.is_active = TRUE
        AND (c.equipment <@ v_child.available_equipment OR c.equipment = '{ball}')
        ORDER BY md5(v_today::TEXT || p_child_profile_id || c.id)
        LIMIT 1;

      IF v_fallback_id IS NULL THEN
        RAISE EXCEPTION 'No challenges available for this age group and equipment';
      END IF;

      v_easy_id := COALESCE(v_easy_id, v_fallback_id);
      v_main_id := COALESCE(v_main_id, v_fallback_id);
      v_bonus_id := COALESCE(v_bonus_id, v_fallback_id);
    END;
  END IF;

  -- Create quest log
  v_log_id := gen_random_uuid()::TEXT;
  INSERT INTO daily_quest_logs (
    id, user_id, child_profile_id, quest_date,
    easy_quest_challenge_id, main_quest_challenge_id, bonus_quest_challenge_id
  ) VALUES (
    v_log_id, v_user_id, p_child_profile_id, v_today,
    v_easy_id, v_main_id, v_bonus_id
  );

  RETURN jsonb_build_object(
    'questLogId', v_log_id,
    'easyQuest', v_easy_id,
    'mainQuest', v_main_id,
    'bonusQuest', v_bonus_id,
    'easyCompleted', FALSE,
    'mainCompleted', FALSE,
    'bonusCompleted', FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restrict access: only authenticated users can call this RPC
REVOKE EXECUTE ON FUNCTION generate_daily_quests FROM public;
GRANT EXECUTE ON FUNCTION generate_daily_quests TO authenticated;
```

---

## DataStore Interface (Domain-Split, Cloud-Only)

Unlike MatchOps Game's monolithic DataStore, Skills uses domain-split interfaces with **only Supabase implementation** (no LocalDataStore).

```typescript
// src/interfaces/stores/ChildProfileStore.ts
interface ChildProfileStore {
  getChildProfiles(): Promise<ChildProfile[]>;
  getChildProfileById(id: string): Promise<ChildProfile | null>;
  createChildProfile(profile: Omit<ChildProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChildProfile>;
  updateChildProfile(id: string, updates: Partial<ChildProfile>): Promise<ChildProfile>;
  deleteChildProfile(id: string): Promise<void>;
}

// src/interfaces/stores/ChallengeStore.ts
interface ChallengeStore {
  getChallenges(): Promise<Challenge[]>;
  getChallengeById(id: string): Promise<Challenge | null>;
  getChallengesByCategory(categoryId: string): Promise<Challenge[]>;
  getChallengesForAgeGroup(ageGroup: string): Promise<Challenge[]>;
  getCategories(): Promise<ChallengeCategory[]>;
}

// src/interfaces/stores/ProgressStore.ts
interface ProgressStore {
  completeChallenge(
    childProfileId: string,
    challengeId: string,
    selfReport?: { reps?: number; rating?: string; notes?: string }
  ): Promise<CompletionResult>;
  getCompletions(childProfileId: string): Promise<ChallengeCompletion[]>;
  getCompletionsByDate(childProfileId: string, date: string): Promise<ChallengeCompletion[]>;
  hasCompletedChallenge(childProfileId: string, challengeId: string): Promise<boolean>;
}

// src/interfaces/stores/QuestStore.ts
interface QuestStore {
  getDailyQuests(childProfileId: string): Promise<DailyQuestLog>;
  markQuestCompleted(questLogId: string, questType: 'easy' | 'main' | 'bonus'): Promise<void>;
}

// src/interfaces/stores/BadgeStore.ts
interface BadgeStore {
  getBadgeDefinitions(): Promise<BadgeDefinition[]>;
  getEarnedBadges(childProfileId: string): Promise<EarnedBadge[]>;
  getUnseenBadges(childProfileId: string): Promise<EarnedBadge[]>;
  markBadgeSeen(earnedBadgeId: string): Promise<void>;
}

// src/interfaces/stores/SettingsStore.ts
interface SettingsStore {
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;
}

// Composition root
interface DataStore extends
  ChildProfileStore,
  ChallengeStore,
  ProgressStore,
  QuestStore,
  BadgeStore,
  SettingsStore {
  initialize(): Promise<void>;
}
```

### CompletionResult Type

Returned by the `complete_challenge` RPC:

```typescript
interface CompletionResult {
  completionId: string;
  xpEarned: number;
  baseXp: number;
  bonusXp: number;
  newLevel: number;
  leveledUp: boolean;
  streak: number;
  masteryLevel: 'bronze' | 'silver' | 'gold';
  completionCount: number;
  isFirstCompletion: boolean;
  practiceMinutes?: number;
  newBadges: EarnedBadge[]; // Badges unlocked by this completion
}
```

This type drives the completion celebration UI — the app knows whether to show a level-up animation, streak milestone, or badge unlock.

---

## XP & Level Curve

```
Level  | Total XP Required | XP for This Level
-------|-------------------|------------------
1      | 0                 | 0 (starting level)
2      | 100               | 100
3      | 250               | 150
4      | 475               | 225
5      | 813               | 338
6      | 1,319             | 506
7      | 2,078             | 759
8      | 3,218             | 1,139
9      | 4,927             | 1,709
10     | 7,490             | 2,563
...    | ...               | (each level = 1.5x previous)
```

At ~3 challenges/day average:
- Bronze (10 XP) + Silver (25 XP) + bonus = ~50-80 XP/day
- Level 5 in ~2 weeks of daily practice
- Level 10 in ~3-4 months of regular practice

The curve is tuned so early levels feel fast and rewarding, while later levels provide long-term goals.

---

## Streak Reset Logic

```
Scenario                                  | Streak Result
------------------------------------------|-----------------------------
Completed challenge today                 | Continue (no change if already active today)
Last active yesterday, complete today     | Increment streak
Last active 2 days ago + freeze available | Use freeze, increment streak
Last active 2+ days ago, no freeze        | Reset to 1
Never active (new profile)                | Set to 1

Streak freeze rules:
- 1 freeze per week (resets on Monday)
- Automatically consumed when needed (not manual)
- Shows "freeze saved your streak!" toast when used
```

---

## Content Seeding Strategy

Challenges and badge definitions are **seeded via SQL migrations**, not user-created:

```sql
-- Example seed data (in a migration file)
INSERT INTO challenge_categories (id, name_key, icon_name, color, sort_order) VALUES
  ('cat_ball_mastery', 'categories.ballMastery', 'football', '#10b981', 1),
  ('cat_dribbling', 'categories.dribbling', 'zap', '#3b82f6', 2),
  ('cat_passing', 'categories.passing', 'target', '#f59e0b', 3),
  ('cat_shooting', 'categories.shooting', 'crosshair', '#ef4444', 4),
  ('cat_juggling', 'categories.juggling', 'refresh-cw', '#8b5cf6', 5),
  ('cat_first_touch', 'categories.firstTouch', 'hand', '#06b6d4', 6),
  ('cat_agility', 'categories.agility', 'activity', '#ec4899', 7),
  ('cat_tricks', 'categories.tricks', 'star', '#f97316', 8);

INSERT INTO challenges (id, category_id, name_key, description_key, instructions_key, success_criteria_key, difficulty, age_groups, estimated_minutes, xp_reward, first_completion_bonus_xp, equipment) VALUES
  ('ch_toe_taps_bronze', 'cat_ball_mastery', 'challenges.toeTaps.name', 'challenges.toeTaps.desc', 'challenges.toeTaps.instructions', 'challenges.toeTaps.success', 'bronze', '{u8,u11,u14}', 5, 10, 15, '{ball}'),
  ('ch_sole_rolls_bronze', 'cat_ball_mastery', 'challenges.soleRolls.name', 'challenges.soleRolls.desc', 'challenges.soleRolls.instructions', 'challenges.soleRolls.success', 'bronze', '{u8,u11,u14}', 5, 10, 15, '{ball}'),
  -- ... more challenges
;
```

Content updates ship as new migrations — same deployment process as schema changes.

---

## Transform Rules (Simplified)

Since Skills is cloud-only, transforms are simpler than MatchOps Game:

### Rule 1: snake_case ↔ camelCase

Standard Supabase convention. All database columns are `snake_case`, all TypeScript fields are `camelCase`.

### Rule 2: Content Uses i18n Keys (Not Raw Text)

Challenge names, descriptions, etc. are stored as **i18n keys**, not translated text. The actual text lives in translation files (`en.json`, `fi.json`). This means:
- Database stores: `"challenges.toeTaps.name"`
- App resolves: `t('challenges.toeTaps.name')` → "Toe Taps" / "Varpaankosketukset"

### Rule 3: user_id Injection

All RPC functions override `user_id` server-side via `auth.uid()`. Never trust client-provided user IDs.

### Rule 4: Date vs Timestamp

- `completed_date` is DATE (for streak/daily calculations): `"2026-03-05"`
- `completed_at` is TIMESTAMPTZ (for ordering within a day): full ISO timestamp
- `last_active_date` is DATE (for streak logic)
- `quest_date` is DATE (one quest set per day)

---

## Offline Behavior

Since this is cloud-first, handle connectivity gracefully:

| Action | Online | Offline |
|--------|--------|---------|
| Browse challenges | Works (cached by React Query) | Works (from cache) |
| View profile/progress | Works | Works (from cache) |
| Complete a challenge | Immediate RPC call | Queue locally, retry when online |
| Generate daily quests | RPC call | Show cached quests if available, or "Connect to load today's quests" |
| Earn badges | Checked server-side in RPC | Evaluated after sync |

React Query's `onMutate` / `useMutation` with optimistic updates can show XP changes immediately while the RPC call resolves.

---

## Future-Proofing for Social Features

The schema is ready for future social features without changes:

- `child_profiles` already has a stable `id` for leaderboard entries
- `display_name` + `avatar_id` provide a safe public identity (no real name)
- Adding a `team_memberships` table later links children to coach-created teams
- Leaderboard queries aggregate `challenge_completions` by team
- **All social features require explicit parent opt-in** (new consent field in `app_settings`)
