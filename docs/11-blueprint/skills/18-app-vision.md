# 18. App Vision — MatchOps Skills

> **Audience**: AI agent building the new app
> **Purpose**: Comprehensive description of what the gamified kids' soccer skills app is, what it does, its features, and how it fits in the MatchOps product family. Read this BEFORE reading any other blueprint document. This is the "what" and "why" — the other documents are the "how".

---

## 1. App Identity

### Name

**MatchOps Skills**

This is the third app in the MatchOps family. The first app (MatchOps Game) handles game day for coaches. The second app (MatchOps Practice) handles practice session planning for coaches. This app is different — it's for the **players themselves** (kids aged 6-14) and gamifies independent soccer practice ("omatoiminen harjoittelu" in Finnish).

### Tagline

**"Play . Train . Level Up"**

This parallels the MatchOps family taglines with the same three-word dot-separated structure:
- MatchOps Game: "Plan . Track . Develop"
- MatchOps Practice: "Design . Drill . Reflect"
- MatchOps Skills: "Play . Train . Level Up"

| Word | What It Means | App Feature |
|------|--------------|-------------|
| Play | The app IS a game — browse challenges, pick what to do | Challenge browser, daily quests |
| Train | Go outside and do the physical practice | Guided skill challenges with instructions |
| Level Up | Come back and mark it done, earn XP, unlock rewards | XP system, levels, badges, streaks |

Finnish translation: **"Pelaa . Treenaa . Nouse tasolle"** (or "Pelaa . Treenaa . Kehity")

### Core Philosophy

**Turn screen time into practice time.** Kids are going to use phones anyway. This app makes the phone a catalyst for physical activity, not a replacement for it. The screen is the motivator (gamification, progress, rewards); the actual value happens outside, with a ball.

**The phone is the coach, the backyard is the training ground.**

### Visual Identity

The app MUST look like it belongs in the MatchOps family, but with a distinctly **kid-friendly, energetic** personality. A parent familiar with MatchOps Game should recognize the family resemblance, while a kid should feel this is THEIR app, not their coach's.

| Element | Specification | Notes |
|---------|--------------|-------|
| Primary font | **Rajdhani** (body + headings, nav, buttons) | Same as MatchOps family — Rajdhani is the **body** font, not just headings |
| Background | `slate-900` (`#0f172a`) + **layered effects** | Indigo wash (`rgba(99,102,241,0.07)` mix-blend-soft-light) + sky gradient top + ambient glows + noise texture |
| Brand accent | `amber-400` / `amber-500` (`#f59e0b`) | **Primary CTA buttons, app name, active nav** — same as MatchOps Game |
| Growth accent | `emerald-500` / `emerald-400` (`#10b981`) | **XP bars, progress, mastery, completion checks** — the kid-energy twist |
| Interaction accent | `indigo-500` (`#6366f1`) | Focus rings, search focus, secondary buttons — same as MatchOps Game |
| Special accent | `purple-500` / `purple-400` (`#8b5cf6`) | Special challenges, boss levels, premium, badges |
| Surface color | `rgba(15, 23, 42, 0.7)` (dark, semi-transparent) | Cards — `bg-slate-900/70` pattern from MatchOps modals |
| Border color | `rgba(51, 65, 85, 0.7)` (slate-700 tint) | Card borders — matches MatchOps `border-slate-700` |
| Card depth | `box-shadow: inset 0 1px 2px rgba(0,0,0,0.15)` | Inner shadow — MatchOps `shadow-inner` pattern |
| Text primary | `white` (`#f1f5f9`) | Headings, important text |
| Text secondary | `slate-400` (`#94a3b8`) | Descriptions, labels, metadata |
| Error | `red-400` / `red-500` | Validation errors |
| Success | `green-400` / `green-500` | Completed challenges, confirmations |
| Theme | **Dark-only at launch** | Consistent with family |

**MatchOps family visual DNA** (must be present in Skills):
- **Rajdhani** as the body font (not just headings — `font-family: 'Rajdhani', sans-serif; font-weight: 500`)
- **Amber primary CTA buttons** with horizontal gradient (`from-amber-500 to-amber-600`, dark text, `shadow-lg shadow-amber-500/20`)
- **Layered background effects**: indigo wash (mix-blend-soft-light) + sky gradient from top + ambient sky glows (60% viewport, blurred) + noise texture overlay
- **Gradient inner cards** for list items: `bg-slate-900/70` + `border-slate-700` + `shadow-inner` — NOT flat opaque grey
- **Hover states** on cards: `bg-slate-800/40` with lighter border (`border-slate-700/50`)

**Key difference from MatchOps Game/Practice**: More color, more animation, more visual feedback. When a kid completes a challenge, there should be satisfying visual/haptic feedback (confetti particle effect, XP counter animation, level-up glow). The coach apps are utilitarian; this app is **fun**. The emerald growth accent replaces Game's indigo as the dominant *content* color — XP, progress bars, mastery stars all glow green.

### App Icon Concept

Same geometric style as MatchOps family but with a kid-energy twist. Consider a **lightning bolt + soccer ball** or **star + soccer ball** motif. The icon should feel achievable and exciting, not clinical. Emerald/amber color treatment on dark background.

### Differentiation from Other MatchOps Apps

| Aspect | MatchOps Game | MatchOps Practice | MatchOps Skills |
|--------|--------------|-------------------|-----------------|
| User | Coach (adult) | Coach (adult) | Player (kid 6-14) |
| Mood | Intense, real-time | Thoughtful, creative | Fun, rewarding, game-like |
| Data model | Games, events, stats | Sessions, exercises, attendance | Challenges, XP, badges, streaks |
| Architecture | Local-first + optional cloud | Local-first + optional cloud | **Cloud-first** (parent account) |
| Auth | Optional (adult email) | Optional (adult email) | **Required** (parent email, child profile) |
| Monetization | Subscription (coach) | Subscription (coach) | Freemium (parent pays for premium content) |
| Usage pattern | During matches | Planning at home | Quick daily sessions (5-15 min in-app, then go practice) |

---

## 2. What This App Does

### Elevator Pitch

MatchOps Skills turns independent soccer practice into a game. Kids (ages 6-14) browse skill challenges organized by category and difficulty, go outside to practice, then mark challenges as complete to earn XP, level up, maintain streaks, and unlock badges. It takes screen time — the thing every parent worries about — and redirects it into physical practice motivation.

**The screen time is the reward system. The practice happens in the real world.**

### The Core Loop

```
1. BROWSE  → Kid opens app, sees today's challenges and their progress
2. PICK    → Selects a challenge (or follows the daily quest)
3. LEARN   → Reads/watches the instructions (what to do, how to do it)
4. TRAIN   → Goes outside and practices (app not needed during this step)
5. LOG     → Comes back, marks challenge as done, optionally logs reps/quality
6. EARN    → XP awarded, streak maintained, progress bars fill, badges unlock
7. REPEAT  → Next challenge suggested, daily quest refreshes tomorrow
```

**Critical design insight**: Step 4 (the actual practice) happens AWAY from the phone. The app's job is to make steps 1-3 compelling enough that the kid goes outside, and step 6 rewarding enough that they come back to log it and keep the streak alive.

#### Practice Timer (Passive, Local-Only)

When a kid taps "Start" on a challenge, a simple elapsed-time timer begins counting in the background. The timer is:
- **Local-only** — stored in local storage alongside the active challenge state, not synced to cloud
- **Passive** — runs in background, no interaction needed. If the OS kills the app, the start timestamp is preserved and elapsed time calculated on return
- **Approximate** — no precision needed. Rounded to nearest minute for display
- **Used for**: Parent digest ("practiced ~45 min this week"), profile stats, and giving the completion a sense of effort ("You practiced for 12 minutes!")
- **NOT used for**: Gating completion. The kid can still tap "I did it!" immediately if they want — the timer is informational, not a requirement

The CTA flow becomes two steps:
1. "Aloita harjoitus" (Start) — timer begins, challenge becomes active
2. "Tein sen!" (I did it!) — timer stops, completion logged with approximate duration

### Target Users

**Primary**: Kids aged 6-14 who play organized youth soccer/futsal

**Parent involvement**: Parent sets up the account (enters their email, creates child profile). After that, the kid uses the app independently. Parent can optionally view progress via a parent dashboard.

**Age-appropriate content AND UI tiers**:

| Age Group | Content Level | Complexity | UI Adaptation |
|-----------|--------------|------------|---------------|
| 6-8 (u8) | Beginner | Simple ball mastery, fun challenges, lots of visual rewards | Larger buttons, less text, more emoji/icons, animated mascot guide, simpler success criteria ("Try 10 times!"), faster early level-ups |
| 9-11 (u11) | Intermediate | Technical skills, combinations, counting reps | Standard UI, full text instructions, rep counting, self-rating |
| 12-14 (u14) | Advanced | Complex moves, tactical awareness drills, self-assessment | Standard UI, detailed coaching points, self-assessment, progression awareness |

**Critical: The u8 group is a fundamentally different user.** A 7-year-old and a 13-year-old cannot use the same text-heavy interface. The age group selection at profile creation must meaningfully change:
- **UI density**: Bigger touch targets, fewer words, more visual cues for u8
- **Reward frequency**: Halved XP requirements for early levels for u8 (faster dopamine loops)
- **Success criteria language**: "Try 10 times!" vs "Complete 20 reps without losing control"
- **Mascot/character guide**: u8 gets an animated character that "talks" to them ("Great job! Try this next!"). Absent for u14.
- **Mini-celebrations**: u8 gets small celebratory animations every 2-3 completions, not just on level-ups

### What It Is NOT

- **NOT a video coaching platform** — no long instructional videos. Short clips (10-30s) showing the skill, then go do it.
- **NOT a social media app** — no messaging, no user-generated content, no friend lists (at launch).
- **NOT a fitness tracker** — no GPS tracking, no heart rate, no step counting. We don't need device sensors.
- **NOT an online game** — the "game" is the real-world practice. The app is the scoreboard.
- **NOT a replacement for team practice** — this complements organized training with independent work.

---

## 3. Architecture Decisions (Differs from Blueprint)

### Cloud-First, No Dual-Mode

Unlike MatchOps Game and Practice (which use local-first + optional cloud), Skills is **cloud-first with offline caching**:

| Decision | Rationale |
|----------|-----------|
| **Parent account required from day one** | Kids lose/break phones. Progress must survive device changes. Parent is the account owner (COPPA compliant). |
| **No LocalDataStore / dual-mode** | Eliminates the most complex part of the blueprint architecture. One DataStore implementation (Supabase). |
| **Offline caching via React Query persistence** | Challenges can be browsed offline (cached). Completions queue locally and sync when online. |
| **No SyncEngine / SyncQueue** | No need for the full sync infrastructure. React Query mutation retry handles offline completions. |

### Simplified Data Layer

```
Blueprint full stack:           Skills stack:
├── DataStore interface         ├── DataStore interface (same)
├── LocalDataStore              ├── SupabaseDataStore (only implementation)
├── SupabaseDataStore           ├── React Query (cache + offline retry)
├── SyncedDataStore             └── (no local store, no sync engine)
├── SyncEngine
├── SyncQueue
└── factory.ts (mode switching)
```

### Auth Model

```
Parent downloads app
→ "Create Account" (parent's email + password)
→ "Add Child Profile" (avatar + display name — no real name required)
→ Multiple child profiles per parent account
→ Kid selects their profile and uses the app
→ Parent can view any child's progress

Supabase Auth: parent's email
Child profiles: rows in child_profiles table, linked to parent's user_id
Active profile: stored locally (which child is currently using the app)
```

### COPPA / GDPR-K Compliance

| Requirement | How We Handle It |
|-------------|-----------------|
| No child accounts | Child profiles under parent's account — parent is data controller |
| Verifiable parental consent | Parent creates account with their email + password |
| Data minimization | No real names required. Avatar + display name only. |
| No targeted advertising | No ads. Period. Monetization via parent-paid subscription. |
| No persistent identifiers on children | No analytics tied to child identity. Sentry uses parent's user_id only. |
| Right to deletion | Parent can delete child profile and all associated data |
| Third-party SDK exposure | Audit all SDKs — no ad SDKs, no tracking SDKs |

**Sentry configuration**: Standard MatchOps Sentry setup is sufficient. Auth is parent-level (parent's user_id), and child profiles contain no PII (display names like "SuperStriker99", avatar IDs). No special child-safe filtering needed beyond existing PII scrubbing.

---

## 4. Feature Set

### Tier 1: Launch Features

#### 4.1 Parent Account & Child Profiles

- Parent signup (email + password)
- Create child profiles (avatar picker + display name)
- Switch between child profiles
- Parent dashboard (view child progress summary)
- Delete child profile (with all data)

#### 4.2 Challenge Library

The core content. Challenges are the "exercises" of this app.

- **Categorized by skill type**: Ball mastery, dribbling, passing, shooting, juggling, agility, first touch
- **Difficulty levels**: Bronze (beginner), Silver (intermediate), Gold (advanced)
- **Age-appropriate filtering**: Content tagged by suitable age range
- **Equipment filtering**: Kid can toggle what they have available (ball, cones, wall) — library and daily quests only show challenges matching available equipment
- **Each challenge has**:
  - Name and short description
  - Category and difficulty
  - Estimated duration (e.g., "5 minutes")
  - Instructions (text + optional short video/animation)
  - Success criteria (what counts as "done" — e.g., "do 20 toe taps without losing the ball")
  - XP reward value
  - Equipment needed (ball, cones, wall, etc.)

**Content is curated by us** (not user-generated). Written in both Finnish and English. Challenges are included in the app — no external content fetching needed. Future: premium challenge packs.

#### 4.2.1 Mastery System (Repeat Incentive)

Kids will exhaust "new" challenges within weeks. The mastery system gives meaning to repetition:

```
First completion  → Bronze star (full XP + first-completion bonus)
3 completions     → Silver star (50% base XP per completion)
10 completions    → Gold star (25% base XP per completion, mastery badge unlocked)
```

- Challenge card shows current mastery star (bronze/silver/gold)
- "Gold star on toe taps!" becomes a point of pride
- Mastery badges exist per category: "Ball Mastery Master" = gold star on all ball mastery challenges
- Makes the free tier (60-80 challenges) feel much deeper — months of meaningful progression

#### 4.2.2 Skill Paths (Progression Direction)

Each category has a recommended progression path — a visual skill tree that shows what to do next:

```
Ball Mastery Path:
[Toe Taps] → [Sole Rolls] → [V-Pull] → [Inside-Outside] → [Combo Master]
   ★★★ gold    ★★ silver     ★ bronze     🔓 next          🔒 locked
```

- Paths give direction to kids who don't know what to practice
- Content is NOT hard-gated — all challenges remain browsable in the library
- Paths are a **recommended order** with visual unlock indicators
- Completing a challenge "unlocks" the next one in the path (cosmetic, motivational)
- Each path culminates in a category mastery challenge (Gold difficulty)
- This is a UI/display layer — uses existing `sortOrder` and `prerequisiteChallengeId` fields

#### 4.3 XP & Leveling System

The core gamification engine.

```
Complete challenge → earn XP
Accumulate XP → level up
Level up → unlock new content + visual reward

XP curve: Each level requires progressively more XP
Level 1: 100 XP
Level 2: 250 XP
Level 3: 450 XP
...etc (tunable formula)
```

- XP awarded per challenge completion (varies by difficulty: Bronze=10, Silver=25, Gold=50)
- Repeat completions: XP reduces with mastery (50% at silver star, 25% at gold star) — still rewarding but encourages trying new things
- Bonus XP for first completion of a challenge
- Bonus XP for perfect streak (7 days in a row)
- Level displayed prominently (level badge, XP progress bar)
- Level-up animation (full-screen celebration, satisfying feedback)
- **Age-tuned XP curve for u8**: Younger kids get faster early levels (halved XP requirements for levels 1-5) to match shorter attention spans and need for frequent rewards

#### 4.4 Streak System

Daily engagement mechanic. The most powerful retention tool.

```
Complete at least 1 challenge today → streak continues
Miss a day → streak resets to 0

Streak milestones:
3 days → "Getting Started" badge
7 days → "One Week Warrior" badge + bonus XP
14 days → "Two Week Champion" badge + bonus XP
30 days → "Monthly Master" badge + bonus XP
```

- Visual streak counter (fire icon + day count)
- Streak freeze: 1 free freeze per week (skip a day without breaking streak)
- Streak history visible in profile
- **Longest streak is the trophy** — displayed more prominently than current streak in the profile. A broken streak is not a failure, it's a record to beat.
- **Gentle streak-break messaging**: "Your streak paused, but your skills didn't! Start a new one today." Never punitive ("You lost your streak!").
- **Weekend mode** (parent setting): Optionally, streaks only count weekdays. Many kids have busy weekends with games, family activities, travel. Parent can toggle this in settings. Weekend completions still earn full XP and count for daily quests — only the streak counter and `last_active_date` are unaffected by weekend activity.

#### 4.5 Daily Quests

Curated daily challenge suggestions to guide kids who don't know what to practice.

```
Each day generates 3 daily quests:
1. "Easy quest" — a Bronze challenge (quick win)
2. "Main quest" — a Silver challenge matching their level
3. "Bonus quest" — a stretch goal (Gold or new category)

Completing all 3 → daily bonus XP
```

- Quests refresh at midnight (local time)
- Algorithm considers: age group, completed challenges (avoid repeats), skill balance, **available equipment**, **mastery level** (prefer challenges the kid hasn't gold-starred yet)
- Deterministic generation from date + profile (same quests if checked twice)
- **"Surprise me!" button**: One-tap random challenge picker on the home screen. Selects an age-appropriate, uncompleted challenge matching available equipment. Removes all decision fatigue for kids who just want to DO something.

#### 4.6 Badge Collection

Achievement system for milestone rewards.

Badge categories:
- **Skill badges**: Complete all Bronze dribbling challenges, etc.
- **Streak badges**: Streak milestones (see above)
- **Volume badges**: Complete 10, 25, 50, 100 total challenges
- **Explorer badges**: Try challenges from every category
- **Special badges**: Seasonal events, first challenge ever, etc.

- Badges displayed in a collection grid (earned = full color, locked = greyed silhouette)
- New badge earned → celebration animation + toast notification

#### 4.7 Profile & Progress

Kid-facing progress view:

- Avatar and display name
- Current level + XP progress bar
- Current streak
- Total challenges completed
- Longest streak (displayed as a trophy — more prominent than current streak)
- Badge collection
- Category breakdown (skill bars: ball mastery, passing, dribbling, etc.)
- Mastery star overview per category (how many bronze/silver/gold stars earned)
- Recent activity feed
- Approximate total practice time (from practice timer data)

### Tier 2: Post-Launch Features

#### 4.8 Parent Dashboard (Enhanced)

- Detailed progress per child
- Practice frequency charts (days active per week)
- Skill category breakdown
- Time estimates (approximate practice time based on challenges completed)
- Multiple children comparison (if multiple profiles)

#### 4.8.1 Weekly Parent Digest

Automated weekly summary sent to the parent (push notification or email):

> "Pikkupeluri practiced 4 times this week! They completed 6 challenges and are on a 12-day streak. Strongest skill: Ball Mastery. New badge earned: One Week Warrior!"

- Sent every Sunday evening (configurable)
- Supabase Edge Function or scheduled cron job
- Gives parents a regular "this is working" signal — justifies the subscription
- Much more impactful than a dashboard they rarely open
- Can be disabled in parent settings

#### 4.9 Premium Challenge Packs

Monetization via content:
- Free tier: 50-100 challenges (enough for months of variety)
- Premium: Additional 200+ challenges, advanced skills, themed packs
- "Position packs" — goalkeeper, defender, midfielder, striker specific
- "Seasonal challenges" — limited-time themed events

#### 4.10 Challenge Videos

Short (10-30 second) demonstration clips for each challenge:
- Filmed from kid's perspective
- Slow motion for complex moves
- Can be bundled in app or streamed (consider offline access)

### Tier 3: Future Features (Architecture-Ready)

#### 4.11 Social / Team Features

- Team leaderboard (coach creates team code, kids join)
- "Challenge a friend" (send a challenge to complete)
- Weekly team XP goals
- **Requires**: Explicit parental opt-in per child

#### 4.12 Coach Integration

- Coach (using MatchOps Game) assigns specific challenges to their team
- Kids see "Coach's pick" in their daily quests
- Practice attendance could sync back to coach
- **Requires**: API integration between Skills and Game

#### 4.13 Physical Product Tie-In

- QR code on physical training cards/mat unlocks challenges
- Similar to FPRO/4Kickerz model but app-first (product enhances, not gates)

---

## 5. UX Flow

### 5.1 First Launch (Parent + Instant First Win)

```
1. Splash screen → "Welcome to MatchOps Skills"
2. "Get Started" → Create Account
   - Email (parent's)
   - Password
   - Confirm password
   - Accept terms + privacy policy (adult consent)
3. "Add a Player" → Create Child Profile
   - Pick an avatar (grid of fun soccer character avatars)
   - Enter display name (NOT real name — can be "SuperStriker99")
   - Select age group (6-8, 9-11, 12-14) — determines content difficulty
   - Optional: select position interest (all-around, goalkeeper, etc.)
   - "What do you have?" → equipment quick-select (ball only / ball + cones / ball + wall / all)
4. "Your First Challenge!" → Auto-selected easy Bronze challenge
   - NOT the home screen — go straight to a fun, quick challenge
   - Pre-selected based on age group and equipment (e.g., "Kick off your journey: 20 toe taps!")
   - Kid does it RIGHT NOW with parent watching
   - Taps "I did it!" → first XP animation, streak starts at 1
5. "Welcome Home" → Main screen (now with 1 completion, streak 1, progress visible)
```

**Why instant first win matters**: The Duolingo onboarding pattern. Never let a new user see a blank progress screen. By the time they reach the home screen, they already have:
- 1 challenge completed
- First XP earned
- Streak started at 1
- Something to show ("I already did one!")
This single design choice dramatically improves day-2 retention.

### 5.2 Daily Usage (Kid)

```
1. Open app → Profile selection (if multiple children)
2. Home screen shows:
   - Active challenge banner (if one was started — see 5.2.1)
   - Streak counter (top)
   - Level + XP bar
   - Daily quests (3 cards)
   - "Surprise me!" random challenge button
   - "Browse All Challenges" button
   - Recent badges earned
3. Tap a quest/challenge → Challenge detail
   - Shows mastery progress if previously attempted ("2/3 to Silver star")
   - Instructions
   - Video (if available)
   - "Aloita harjoitus" (Start) button
4. Tap Start → challenge becomes active, practice timer begins
   - Home screen now shows active challenge banner
   - Phone not needed during practice — can be locked/backgrounded
   - Timer uses start timestamp, survives app kills
5. Come back → app shows active challenge banner at top of home screen
   - "Jatka: Kartiokuljetus — 12 min — Merkitse tehdyksi?"
   - Shows elapsed practice time since start
   - Tap → straight to "I did it!" flow (skip re-reading instructions)
   - OR tap into full detail to re-read instructions
6. Tap "I did it!"
   - Optional: log reps ("How many did you do?")
   - Optional: self-rate ("How did it feel?" — easy/good/hard)
   - Practice duration auto-captured from timer
7. **Completion celebration screen** (full-screen, THE dopamine moment):
   - XP counter animates from current to new total
   - Streak counter pulses and increments
   - Mastery star upgrades visually if threshold crossed (bronze→silver, silver→gold)
   - Badge unlock animation if earned
   - Practice duration shown ("12 min harjoittelua!")
   - "Hienoa!" (Great!) dismissal button
   - If level-up: extra-special full-screen celebration with level number, confetti, glow
8. If daily quests all done → bonus celebration stacks on top
9. Back to home → next suggestion
```

#### 5.2.1 Active Challenge State (App Resumption)

Kids put down the phone to practice, then come back later. The OS may have killed the app. They shouldn't have to hunt for where they were.

- When a kid taps "Start" on a challenge, it's saved as their **active challenge** with a start timestamp (persisted in local storage, not cloud)
- Practice timer begins counting from the start timestamp
- On app open, if an active challenge exists, the home screen shows a prominent "Continue" banner at the top with elapsed time
- Tapping the banner goes to a simplified completion view (big "I did it!" button, practice duration, optional logging)
- Active challenge clears after completion or manual dismissal ("I'll do this later")
- Only one active challenge at a time

### 5.3 Parent View

```
1. Settings icon → "Parent Dashboard" (requires re-entering password)
2. Shows:
   - Child summary cards (each child's level, streak, recent activity)
   - "Manage Profiles" (add/edit/delete children)
   - "Account Settings" (email, password, subscription)
   - "Delete Account" (GDPR: removes all data)
```

The parent dashboard is PIN/password-gated so kids can't access account settings.

---

## 6. Content Strategy

### Challenge Creation Principles

Challenges must be:
1. **Doable alone** — no partner needed (this is independent practice)
2. **Doable at home** — backyard, park, or indoor with modifications
3. **Equipment-minimal** — most need only a ball. Some need a wall or cones.
4. **Clear success criteria** — kid knows when they've "done it"
5. **Age-appropriate** — a 7-year-old and a 13-year-old get different versions
6. **Safe** — no dangerous moves, no heading for young kids (concussion policy)

### Challenge Categories

| Category | Examples | Equipment |
|----------|---------|-----------|
| Ball Mastery | Toe taps, sole rolls, foundation moves | Ball |
| Dribbling | Cone weaves, speed dribbles, direction changes | Ball, cones |
| Passing | Wall passes, target hitting, first-touch control | Ball, wall |
| Shooting | Target practice, power shots, finesse | Ball, target/goal |
| Juggling | Feet only, thigh combos, around the world | Ball |
| First Touch | Receiving from bounce, wall return, aerial control | Ball, wall |
| Agility | Ladder drills, cone sprints (no ball) | Cones/ladder |
| Tricks | Step-overs, elastico, rainbow flick | Ball |

### Content Volume Targets

| Phase | Challenges | Coverage |
|-------|-----------|----------|
| Launch | 60-80 | Core categories, all age groups, Bronze+Silver |
| Month 3 | 120-150 | Gold difficulty, tricks, position-specific |
| Month 6 | 200+ | Premium packs, seasonal events |

### Bilingual Content

All challenge content must exist in both Finnish and English:
- i18next translation keys for all text
- Video content: either language-neutral (no narration, just demonstration) or separate audio tracks
- **Finnish is the primary language** (Finnish market first)

---

## 7. Monetization Model

### Freemium (Parent Pays)

| Tier | Price | Content |
|------|-------|---------|
| **Free** | 0 | 60-80 challenges, full gamification, 1 child profile |
| **Premium** | ~3.99/month or ~29.99/year | All challenges, unlimited child profiles, premium badges, position packs |

**Why freemium, not paid upfront**:
- Free tier must be genuinely useful (not a crippled demo)
- Kids try it, get hooked on the streak, parent sees value, upgrades
- Lower barrier than physical products (FPRO = 50-80 + subscription)
- Competitors charge for hardware; we charge for content

**Payment**: Google Play / App Store in-app purchases. Parent's payment method on the app store account.

---

## 8. Technical Constraints

### No Personal Data from Children

- No real names — display name only (can be "CoolKicker42")
- No photos — avatar picker only (pre-made characters)
- No location — no GPS, no location permissions
- No contacts — no friend-finding, no phone book access
- No microphone/camera — no voice recording, no video selfies
- No advertising IDs — no ad SDKs

### Minimal Permissions

The app should request ZERO device permissions at launch:
- No camera
- No microphone
- No location
- No contacts
- No push notifications (consider: optional, parent-consented only)

### Performance on Kids' Devices

Kids often use old/budget phones or hand-me-down tablets. The app must:
- Run smoothly on low-end Android devices (2GB RAM, older SoCs)
- Keep bundle size small (aggressive code splitting)
- Minimize network usage (cache challenges aggressively)
- Work on both phone and tablet form factors

---

## 9. Competitive Positioning

| Feature | FPRO | 4Kickerz | MatchOps Skills |
|---------|------|----------|-----------------|
| Entry cost | ~60-80 (mat required) | ~60 (mat required) | **Free** |
| Physical product | Required (mat) | Required (mat) | Not needed |
| Age range | 6-14 | 4-15 | 6-14 |
| XP/Gamification | Yes | Yes | Yes |
| Leaderboard | Global | Yes | Future (team-based) |
| Content volume | ~100 drills | 69 drills | 60-80 free, 200+ premium |
| Offline | Unknown | Unknown | Yes (cached) |
| Language | English | English | **Finnish + English** |
| Platform | iOS + Android | iOS + Android | **PWA** (web, installable) |

**Key differentiators**:
1. **No hardware required** — just download and start
2. **Finnish language** — first-mover in Finnish market
3. **PWA** — no app store gatekeeping, instant updates, works everywhere
4. **MatchOps ecosystem** — future integration with coach's tools

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily active kids | 100+ within 3 months of Finnish launch | Anonymized session count |
| 7-day retention | >40% | Anonymized cohort analysis |
| Average streak length | >5 days | Aggregate stats (no individual tracking) |
| Challenges completed/week/kid | >5 | Aggregate stats |
| Free → Premium conversion | >5% | Payment data (parent accounts only) |
| Parent satisfaction | >4.0 stars | App store reviews |

**Analytics approach**: All metrics must be aggregated and anonymized. No individual child tracking. Measure at the parent-account level or as pure aggregates. This is both ethical and COPPA-compliant.
