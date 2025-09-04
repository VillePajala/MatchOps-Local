# MatchOps Local - Exclusive Features

This document outlines features that are unique to the local version of MatchOps and not present in the cloud version.

## 1. Smart Roster Detection System

### Overview
The local version implements a comprehensive system to prevent users from creating games without players in their roster, ensuring a smooth user experience from the start.

### How It Works

#### Empty Roster Prevention
- **New Game Button in Control Bar**: When clicked with an empty roster, displays a confirmation dialog:
  - EN: "You need at least one player in your roster to create a game. Would you like to add players now?"
  - FI: "Tarvitset vähintään yhden pelaajan kokoonpanoon luodaksesi pelin. Haluatko lisätä pelaajia nyt?"
  - Clicking "OK" opens the Roster Settings modal
  - Clicking "Cancel" keeps the user in their current context

#### Start Screen Integration
- When selecting "Start New Game" from the start screen, the same roster check occurs
- Prevents the confusing scenario of reaching the game setup modal without any players to select

### Implementation Details
- Check occurs in `handleStartNewGame` function (src/components/HomePage.tsx:2191)
- Also integrated in the `initialAction` effect for start screen navigation (src/components/HomePage.tsx:427)
- Uses translation keys for internationalization support

## 2. Adaptive Start Screen System

### Overview
The local version implements a sophisticated dual-mode start screen that eliminates first-time user confusion while providing power users with immediate access to all features. The system automatically detects user experience level and presents the appropriate interface.

### Core Detection Logic

**First-Time User Detection (current implementation)** (`src/app/page.tsx`):
```typescript
const isFirstTimeUser = !hasSavedGames;
```

**State Variables Checked (for button states/text, not for first-time detection)**:
- **hasPlayers**: Whether roster contains any players (`getMasterRoster()`)
- **hasSavedGames**: Whether any games have been saved (`getSavedGames()`)
- **hasSeasonsTournaments**: Whether seasons or tournaments exist (`getSeasons()`, `getTournaments()`)
- **canResume**: Whether the last game can be resumed (`getCurrentGameIdSetting()`)

### Dual Interface System

#### Mode 1: First-Time User Interface (Simplified)

**When Shown**: `isFirstTimeUser = true`

**Layout**:
```
┌─────────────────────────────┐
│        MatchOps Local       │
│     Plan · Record · Assess  │
│         ─────────          │
│                            │
│    🎯 [Get Started]        │
│                            │
│    📚 [How It Works]       │
│                            │
│         [EN] [FI]          │
└─────────────────────────────┘
```

**Buttons**:
1. **"Get Started"** - Large, prominent primary action
   - **Action**: Opens main app (DEFAULT_GAME_ID) 
   - **Triggers**: Soccer field center overlay with onboarding
   - **Result**: User guided through roster setup → first game creation

2. **"How It Works"** - Secondary help option
   - **Action**: Opens instructions modal locally
   - **Content**: Step-by-step app guide

**Benefits**:
- ✅ **Zero decision paralysis** - one clear path forward
- ✅ **No broken/disabled buttons** - clean first impression
- ✅ **Leverages existing guidance** - uses soccer field overlay system
- ✅ **Progressive disclosure** - features unlock as user progresses

#### Mode 2: Experienced User Interface (Full-Featured)

**When Shown**: `isFirstTimeUser = false` (has data in any category)

**Smart Button Behavior**:

1. **Resume Last Game Button** (Always shown):
   - **Enabled when**: Resumable game exists → "Jatka edellistä peliä" / "Resume Last Game"
   - **Disabled when**: No resumable game (dimmed)

2. **Create Game Button** (Smart text):
   - **Has saved games**: "Luo uusi ottelu" (Create New Game)
   - **No saved games**: "Luo ensimmäinen ottelu" (Create First Game)
   - **Disabled when**: No players in roster

3. **Load Game Button**:
   - **Enabled when**: Saved games exist
   - **Disabled when**: No saved games

4. **Seasons & Tournaments Button** (Smart text):
   - **Has seasons/tournaments**: "Kaudet & Turnaukset" (Seasons & Tournaments)
   - **No seasons/tournaments**: "Ensimmäinen kausi/turnaus" (First Season/Tournament)
   - **Disabled when**: No players in roster

5. **View Stats Button**:
   - **Enabled when**: Saved games exist
   - **Disabled when**: No saved games

6. **Setup Team Roster Button** (Conditional):
   - **Shows when**: No players in roster
   - **Position**: Top of list (primary action)
   - **Hides when**: Players exist (feature unlocked)

### Visual Design System

#### Button Styles (`src/components/StartScreen.tsx:55-59`):
```css
/* Primary (enabled) buttons */
w-full px-3 py-2.5 rounded-md text-sm sm:text-base font-semibold 
text-white bg-gradient-to-r from-indigo-600 to-violet-700 
hover:from-indigo-500 hover:to-violet-600 transition-colors 
focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md 
text-center leading-tight

/* Disabled buttons */
w-full px-3 py-2.5 rounded-md text-sm sm:text-base font-semibold 
text-slate-400 bg-gradient-to-r from-slate-700 to-slate-600 
cursor-not-allowed shadow-md opacity-50 text-center leading-tight
```

#### Responsive Layout:
- **Container**: `flex-1 px-4 py-6 gap-1.5 max-w-sm mx-auto justify-center`
- **Fills space**: Between glowing title line and language selector
- **Adaptive gaps**: Tighter spacing (`gap-1.5`) for multiple buttons
- **Consistent width**: All buttons same size regardless of text length

### Alert and Redirection System

#### Empty Roster Prevention (`src/components/HomePage.tsx:430-441`):

**Trigger**: User tries to create game without players

**Alert Message**:
- **English**: "You need at least one player in your roster to create a game. Would you like to add players now?"
- **Finnish**: "Tarvitset vähintään yhden pelaajan kokoonpanoon luodaksesi pelin. Haluatko lisätä pelaajia nyt?"

**Business Logic**:
```typescript
if (availablePlayers.length === 0) {
  const shouldOpenRoster = window.confirm(
    t('controlBar.noPlayersForNewGame')
  );
  
  if (shouldOpenRoster) {
    setIsRosterModalOpen(true);  // Redirect to roster setup
  }
}
```

### Integration with Soccer Field Onboarding

#### First-Time User Path:
1. **Start Screen**: User clicks "Get Started"
2. **HomePage Loads**: `currentGameId = DEFAULT_GAME_ID`
3. **Center Overlay Appears**: Soccer field shows onboarding overlay
4. **Smart Messaging**: 
   - No players: "Ready to get started?" → "Setup Team Roster"
   - Has players: "Ready to track your first game?" → "Create Your First Game"
5. **Workspace Warning**: Top banner when actively using the temporary workspace

#### Workspace Awareness System Integration:
- **Temporary workspace indicators** appear when using DEFAULT_GAME_ID
- **Center overlay guidance** for roster setup or game creation
- **Progressive unlocking** as user completes setup steps

### State Transitions and User Journey

#### Complete First-Time User Journey:
```
1. Fresh Install
   ↓ (isFirstTimeUser = true)
2. Simple Start Screen: "Get Started"
   ↓ (user clicks)
3. Soccer Field with Center Overlay: "Setup Team Roster"
   ↓ (user adds players)
4. hasPlayers = true → isFirstTimeUser = false
   ↓ (user returns to start screen)
5. Full Smart Start Screen: All buttons with smart states
   ↓ (progressive feature discovery)
6. Expert User: All features unlocked and accessible
```

#### State Persistence:
- **localStorage exclusion**: DEFAULT_GAME_ID never saved
- **Automatic detection**: No configuration needed
- **Progressive enhancement**: Features appear as prerequisites met
- **Backward compatibility**: Works with existing data structures

### Translation Architecture

#### Simplified Interface Keys:
```json
"firstTimeUser": {
  "getStarted": "Get Started" / "Aloita",
  "getStartedDesc": "Set up your team and start tracking games" / "Luo joukkue ja aloita pelien seuranta"
}
```

#### Smart Button Text System:
- **Context-aware text**: Same button shows different text based on user state
- **Progressive language**: "First" → "New" as user gains experience
- **Shortened labels**: Fit multiple buttons in limited screen space

### Benefits Over Traditional Onboarding

#### Eliminates Common UX Problems:
- ❌ **No tutorial fatigue** - guidance integrated into natural workflow
- ❌ **No skip buttons** - users can't bypass important setup
- ❌ **No overwhelming interface** - features revealed progressively
- ❌ **No dead-end buttons** - everything clickable serves a purpose

#### Provides Superior Experience:
- ✅ **Natural discovery** - features unlock as users need them
- ✅ **Context-sensitive help** - guidance appears when relevant
- ✅ **Flexible learning** - can explore or follow structured path
- ✅ **Expert-friendly** - experienced users get full interface immediately

### Technical Implementation Details

#### File Structure:
- **`src/app/page.tsx`**: State detection and interface switching
- **`src/components/StartScreen.tsx`**: Dual-mode interface rendering
- **`src/components/HomePage.tsx`**: Soccer field onboarding integration
- **Alert system**: Cross-component roster validation
- **Translation keys**: Distributed across locale files

#### Performance Optimizations:
- **Single state check**: One async operation determines interface mode
- **Conditional rendering**: Only renders needed interface elements
- **Shared components**: Reuses existing modals and guidance systems
- **Lazy evaluation**: State only checked on app initialization

## 3. Technical Implementation Details

### Centralized State Management
- All user state checked at app initialization (`src/app/page.tsx`)
- Single source of truth for interface mode switching
- State passed down through props for consistent UI across components
- Reduces redundant API calls through smart caching

### Translation Support
- Dual interface translation keys for both modes
- Context-aware button text (same button, different text based on state)
- Fully internationalized alerts and guidance messages
- Smart text progression ("First" → "New" as user gains experience)

## 4. Enhanced "How It Works" System

### User Flow-Focused Help Content
Unlike traditional feature-by-feature documentation, the local version provides contextual, flow-based guidance:

#### Getting Started Section
- **Step-by-step onboarding**: Clear 4-step process from roster creation to game tracking
- **Why-focused explanations**: Explains the reasoning behind each step (e.g., why roster is required first)
- **Visual progression**: Organized cards showing the logical user journey

#### Contextual Feature Explanations
- **During the Game**: Features organized by when you use them (field management, event recording)
- **After the Game**: Post-game workflow (saving, assessment, analysis)
- **Key Features**: Real-world benefits explained (seasons, tournaments, offline-first)

### Smart Navigation
- **Start Screen Integration**: Opens locally without changing screens
- **Hamburger Menu Access**: Available from any page via Resources section
- **Consistent Experience**: Same content accessible from multiple entry points

### Translation Quality
- **Improved Finnish**: Better translations focusing on user actions (e.g., "Luo kokoonpano" vs "Kokoonpanon asetukset")
- **Action-oriented language**: Emphasizes what users should do rather than technical features

## 6. Robust Alert System

### Consistent Messaging
- **Single source of truth**: All roster-related alerts use the same translation key
- **Fallback protection**: Alerts always show explanatory text, never variable names
- **Prevented duplicates**: Fixed useEffect dependencies to prevent multiple alerts

### Smart Alert Logic
- **Context-aware**: Different entry points (start screen vs control bar) show same helpful message
- **Progressive guidance**: Alerts offer next steps rather than just blocking actions
- **Early prevention**: Checks happen before users reach dead-end modals

## Future Enhancements (Planned)

### Advanced Onboarding
- Interactive tutorials with guided tours
- Demo games with overlay tips
- Progress tracking for new users

### Contextual Intelligence
- Usage pattern analysis for personalized suggestions
- Smart feature discovery based on user behavior
- Adaptive UI based on experience level

---

*Last Updated: 2025-08-22 (v2.0)*
*Version: MatchOps Local v0.1.0*

## 7. First Game Onboarding System

### Overview
The local version implements a sophisticated first-game onboarding flow that guides new users through app setup while allowing experienced users to experiment freely. This system combines smart detection, progressive disclosure, and contextual guidance.

### Architecture Components

#### 1. State Management
```typescript
// Core state variables in HomePage.tsx
const [currentGameId, setCurrentGameId] = useState<string | null>(DEFAULT_GAME_ID);
// Optional: hasUsedWorkspace is currently not toggled in code (defaults to false)
const [hasUsedWorkspace, /* setHasUsedWorkspace */] = useState<boolean>(false);
const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
const [playersOnField, setPlayersOnField] = useState<Player[]>([]);
const [drawings, setDrawings] = useState<DrawnElement[]>([]);
```

- **DEFAULT_GAME_ID**: Constant value `'unsaved_game'` identifies temporary workspace
- **hasUsedWorkspace**: Tracks when user explicitly chooses to experiment
- **State combinations**: System responds to different combinations of these states

#### 2. Soccer Field Center Overlay

**Location**: `src/components/HomePage.tsx` (First-game overlay block)

**Business Logic**:
```javascript
// Overlay shows when ALL conditions are met:
currentGameId === DEFAULT_GAME_ID &&     // In temporary workspace
playersOnField.length === 0 &&           // No players placed
drawings.length === 0 &&                  // No drawings made
!hasUsedWorkspace                         // Haven't chosen to experiment
```

**Component Structure**:
```jsx
<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
  <div className="bg-slate-800/95 border border-indigo-500/50 rounded-xl p-8 max-w-md mx-4 pointer-events-auto shadow-2xl backdrop-blur-sm">
    {/* Content varies based on availablePlayers.length */}
  </div>
</div>
```

**Styling Breakdown**:
- **Positioning**: `absolute inset-0` covers entire soccer field
- **Centering**: `flex items-center justify-center` centers the modal
- **Interactivity**: `pointer-events-none` on container, `pointer-events-auto` on modal
- **Z-index**: `z-30` ensures it appears above field but below modals
- **Appearance**: Dark semi-transparent background with indigo border
- **Glass effect**: `backdrop-blur-sm` creates modern glass morphism
- **Responsive**: `max-w-md mx-4` ensures mobile compatibility

#### 3. Conditional Content System

**No Players State**:
```jsx
{availablePlayers.length === 0 ? (
  <>
    <h3>{t('firstGame.titleNoPlayers')}</h3>  // "Ready to get started?"
    <p>{t('firstGame.descNoPlayers')}</p>      // Guide to roster setup
    <button onClick={() => setIsRosterModalOpen(true)}>
      {t('firstGame.setupRoster')}             // "Set Up Team Roster"
    </button>
  </>
)}
```

**With Players State**:
```jsx
{availablePlayers.length > 0 && (
  <>
    <h3>{t('firstGame.title')}</h3>           // "Ready to track your first game?"
    <p>{t('firstGame.desc')}</p>               // Benefits of game tracking
    <button onClick={() => setIsNewGameSetupModalOpen(true)}>
      {t('firstGame.createGame')}              // "Create Your First Game"
    </button>
  </>
)}
```

#### 4. Experimentation Option (optional, currently disabled)

The prior concept of an explicit "experiment first" toggle is not enabled in the current code. The overlay hides automatically as soon as players are placed on the field or drawings are made. If you want to enable a manual experimentation toggle:
- Add `const [hasUsedWorkspace, setHasUsedWorkspace] = useState(false);` in `HomePage`.
- Render an "experiment first" button that calls `setHasUsedWorkspace(true)`.
- Keep the warning banner logic as-is (it already checks `hasUsedWorkspace` in addition to other signals).

#### 5. Workspace Warning Banner

**Location**: `src/components/HomePage.tsx:2599-2615`

**Display Logic**:
```javascript
// Shows when ANY of these are true:
currentGameId === DEFAULT_GAME_ID && (
  playersOnField.length > 0 ||    // Players placed
  drawings.length > 0 ||          // Drawings made
  hasUsedWorkspace                // Optional: if manual toggle is enabled
)
```

**Component Design**:
```jsx
<div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40">
  <div className="bg-amber-600/95 border border-amber-500/50 rounded-lg px-6 py-3 shadow-xl backdrop-blur-sm max-w-md">
    <div className="flex items-center gap-3 text-sm">
      <div className="w-3 h-3 bg-amber-200 rounded-full animate-pulse flex-shrink-0"/>
      <span className="text-amber-100 font-medium flex-1">
        {t('firstGame.workspaceWarning')}
      </span>
      <button className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-900 rounded-md text-xs font-semibold">
        {t('firstGame.createRealGame')}
      </button>
    </div>
  </div>
</div>
```

**Styling Details**:
- **Position**: Fixed at top center with `top-4 left-1/2 transform -translate-x-1/2`
- **Z-index**: `z-40` ensures it stays above soccer field elements
- **Colors**: Amber color scheme for warning semantics
- **Animation**: Pulsing dot with `animate-pulse` draws attention
- **Button**: Proper button styling with hover states and shadows
- **Layout**: Flexbox with `flex-1` for text and `flex-shrink-0` for fixed elements

### Translation Architecture

**English Keys** (`public/locales/en/common.json`):
```json
"firstGame": {
  "title": "Ready to track your first game?",
  "desc": "Create a game to start tracking player positions...",
  "titleNoPlayers": "Ready to get started?",
  "descNoPlayers": "First, set up your team roster...",
  "setupRoster": "Set Up Team Roster",
  "rosterFirst": "Add players first, then create your game",
  "createGame": "Create Your First Game",
  "createSeasonFirst": "Create Season/Tournament First",
  "orExperiment": "Or experiment first:",
  "experimentOption": "Use temporary workspace for testing",
  "workspaceWarning": "Temporary workspace - changes won't be saved",
  "createRealGame": "Create real game"
}
```

**Finnish Keys** (`public/locales/fi/common.json`):
```json
"firstGame": {
  "title": "Valmis seuraamaan ensimmäistä peliäsi?",
  "desc": "Luo peli aloittaaksesi pelaajien sijainnin seurannan...",
  "titleNoPlayers": "Valmis aloittamaan?",
  "descNoPlayers": "Luo ensin joukkueen kokoonpano...",
  "setupRoster": "Luo kokoonpano",
  "rosterFirst": "Lisää pelaajat ensin, sitten luo pelisi",
  "createGame": "Luo ensimmäinen pelisi",
  "createSeasonFirst": "Luo ensin kausi/turnaus",
  "orExperiment": "Tai kokeile ensin:",
  "experimentOption": "Käytä väliaikaista työtilaa testaamiseen",
  "workspaceWarning": "Väliaikainen työtila - muutoksia ei tallenneta",
  "createRealGame": "Luo oikea peli"
}
```

### User Flow Scenarios

#### Scenario 1: New User, No Roster
1. User opens app → `currentGameId = DEFAULT_GAME_ID`, `availablePlayers = []`
2. Center overlay appears with "Ready to get started?"
3. User clicks "Set Up Team Roster" → Roster modal opens
4. After adding players, overlay updates to "Ready to track your first game?"
5. User clicks "Create Your First Game" → Game setup modal opens
6. Game created → `currentGameId` changes, overlays disappear

#### Scenario 2: User Wants to Experiment
1. Center overlay visible with experimentation option
2. User clicks "Use temporary workspace for testing"
3. `hasUsedWorkspace = true` → Center overlay hides
4. Top warning banner appears immediately
5. User experiments with field, players, drawings
6. Warning persists with "Create real game" button
7. Clicking button → Game setup modal → Real game created

#### Scenario 3: User with Existing Roster
1. User opens app with players already in roster
2. Center overlay shows "Ready to track your first game?"
3. No "Load Game" option (logical: can't load first game)
4. Direct path to game creation or experimentation

### Technical Implementation Details

#### State Persistence
- `DEFAULT_GAME_ID` ('unsaved_game') is excluded from localStorage saves
- Prevents temporary workspace from polluting saved games list
- Clean separation between experimental and real data

#### Performance Optimizations
- Conditional rendering prevents unnecessary DOM elements
- React keys ensure efficient re-renders
- Translation loading is lazy and cached

#### Accessibility Considerations
- Proper button elements with hover states
- High contrast colors (amber on dark backgrounds)
- Clear visual hierarchy with size and spacing
- Semantic HTML structure

### Benefits Over Cloud Version
- **Guided Discovery**: New users can't get lost or confused
- **Safe Experimentation**: Test features without commitment
- **Progressive Disclosure**: Complexity revealed gradually
- **Clear Data Model**: Users understand what gets saved
- **Reduced Support**: Self-explanatory interface reduces questions

## 10. Enhanced First-Time User Guidance System

### Overview
Building on the dual-mode start screen, MatchOps Local implements a comprehensive first-time user guidance system that provides contextual, step-by-step onboarding through natural app workflows. This system eliminates confusion while teaching users the proper app structure and flow.

### Core Philosophy: Natural Learning Through Guided Discovery

**Traditional Onboarding Problems Solved**:
- ❌ **Tutorial fatigue** - Users skip long guided tours
- ❌ **Feature overwhelm** - Too many options cause decision paralysis
- ❌ **Disconnected help** - Instructions don't match actual workflows
- ❌ **Dead-end buttons** - Features that don't work without prerequisites

**MatchOps Local Approach**:
- ✅ **Progressive disclosure** - Features revealed as prerequisites are met
- ✅ **Contextual guidance** - Help appears exactly when and where needed
- ✅ **Natural workflows** - Learning happens through actual app usage
- ✅ **Clear prerequisites** - Visual feedback shows what needs to be done first

### Implementation Architecture

#### 1. Smart Instructions Modal Prevention (`src/components/HomePage.tsx:807-812`)

**Problem Solved**: Automatic instructions popup interrupting first-time user flow

**Implementation**:
```typescript
// Only show automatic instructions for experienced users with specific actions, not first-time users
const seenGuide = await getHasSeenAppGuide();
const hasAnyData = Object.keys(savedGames).length > 0; // Check if user has any saved games
if (!seenGuide && initialAction !== null && hasAnyData) {
  setIsInstructionsModalOpen(true);
}
```

**Business Logic**:
- **First-time users** (no saved games) → Never get automatic instructions popup
- **Experienced users** with specific actions → Get contextual help when appropriate
- **Manual access** → Instructions always available via "How It Works" button

#### 2. Enhanced Soccer Field Center Overlay (`src/components/HomePage.tsx:2543-2595`)

**Problem Solved**: Users don't know what to do when they first see the app

**Visual Design**:
```jsx
<div className="bg-slate-800/95 border border-indigo-500/50 rounded-xl p-10 max-w-lg mx-4 pointer-events-auto shadow-2xl backdrop-blur-sm">
  <div className="text-center">
    <div className="w-16 h-16 mx-auto bg-indigo-600/20 rounded-full flex items-center justify-center mb-3">
      <div className="text-3xl">⚽</div>
    </div>
    {/* Dynamic content based on user state */}
  </div>
</div>
```

**State-Responsive Content System**:

**Case 1: No Players in Roster**
```jsx
{availablePlayers.length === 0 ? (
  <>
    <h3>{t('firstGame.titleNoPlayers', 'Ready to get started?')}</h3>
    <p>{t('firstGame.descNoPlayers', 'Add players first so you can create your first match.')}</p>
    <button onClick={() => setIsRosterModalOpen(true)}>
      {t('firstGame.setupRoster', 'Set Up Team Roster')}
    </button>
  </>
)}
```

**Case 2: Has Players, Ready for First Game**
```jsx
{availablePlayers.length > 0 && (
  <>
    <h3>{t('firstGame.title', 'Everything ready for your first match!')}</h3>
    <p>{t('firstGame.desc', 'Now you can create your first match. If you\'d like, you can first create a season or tournament to link your match during creation.')}</p>
    <button onClick={() => setIsNewGameSetupModalOpen(true)}>
      {t('firstGame.createGame', 'Create Your First Match')}
    </button>
    
    <button onClick={() => setIsSeasonTournamentModalOpen(true)}>
      {t('firstGame.createSeasonFirst', 'Create Season/Tournament First')}
    </button>
  </>
)}
```

#### 3. Improved Finnish Language and UX Copy

**Problem Solved**: Confusing and overly technical language in guidance

**Before (Problems)**:
- ❌ "Luo ensin joukkueen kokoonpano, sitten luo ensimmäinen pelisi aloittaaksesi pelaajien sijainnin, maalien ja suorituksen seurannan"
- ❌ References to "player position tracking" (misleading)
- ❌ Overly complex sentence structure

**After (Solutions)**:
- ✅ **No players**: "Lisää ensin pelaajia joukkueeseesi, jotta voit luoda ensimmäisen ottelusi"
- ✅ **Ready for game**: "Kaikki valmista ensimmäiseen otteluun! Nyt voit luoda ensimmäisen ottelusi. Halutessasi voit ensin luoda kauden tai turnauksen, johon liittää ottelusi sen luontivaiheessa"
- ✅ **Clear action steps** with specific outcomes explained

**Translation Improvements**:
```json
// Improved Finnish (more natural and action-oriented)
"firstGame": {
  "title": "Kaikki valmista ensimmäiseen otteluun!",  // Celebratory tone
  "titleNoPlayers": "Valmis aloittamaan?",           // Encouraging
  "descNoPlayers": "Lisää ensin pelaajia joukkueeseesi, jotta voit luoda ensimmäisen ottelusi.", // Clear prerequisite
  "desc": "Nyt voit luoda ensimmäisen ottelusi. Halutessasi voit ensin luoda kauden tai turnauksen, johon liittää ottelusi sen luontivaiheessa." // Clear workflow explanation
}
```

#### 4. Removed Confusing Options

**Problem Solved**: Too many choices causing decision paralysis

**Removed Elements**:
- ❌ **Temporary workspace option** from center overlay - was confusing for first-time users
- ❌ **Redundant helper text** ("Add players first, then create your game") - already clear from main description
- ❌ **"Explore App" button confusion** - replaced with honest "Resume Last Game" (dimmed when unavailable)

**Focused Workflow Result**:
- ✅ **Single clear path** for each user state
- ✅ **No decision paralysis** - obvious next steps
- ✅ **Honest UI** - buttons show true functionality, not misleading alternatives

#### 5. Enhanced Start Screen Button Hierarchy

**Problem Solved**: Buttons too small and inconsistent sizing

**Improved Button Design**:
```css
/* Enhanced button styles for experienced users */
primaryButtonStyle = 'w-full px-4 py-3 rounded-lg text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg text-center leading-tight';

disabledButtonStyle = 'w-full px-4 py-3 rounded-lg text-base font-semibold text-slate-400 bg-gradient-to-r from-slate-700 to-slate-600 cursor-not-allowed shadow-lg opacity-50 text-center leading-tight';
```

**Visual Improvements**:
- ✅ **Bigger buttons**: `px-3 py-2.5` → `px-4 py-3` for better touch targets
- ✅ **Consistent sizing**: `text-sm sm:text-base` → `text-base` for clarity
- ✅ **Modern appearance**: `rounded-md` → `rounded-lg`, `shadow-md` → `shadow-lg`
- ✅ **Better spacing**: Optimized gap between glowing line and buttons

#### 6. Smart Button Text System

**Problem Solved**: Confusing button text that doesn't reflect user context

**Button Text Logic (current)**:
```typescript
// Season/Tournament button text switches based on data availability
{hasSeasonsTournaments ?
  t('startScreen.createSeasonTournament', 'Seasons & Tournaments') :
  t('startScreen.createFirstSeasonTournament', 'Create Season/Tournament')
}

// Resume button - always shown, disabled when not resumable
<button 
  className={canResume ? primaryButtonStyle : disabledButtonStyle}
  disabled={!canResume}
>
  {t('startScreen.resumeGame', 'Resume Last Game')}
</button>
```

### Complete User Journey Documentation

#### Journey A: Brand New User (No Data)

1. **App Opens** → Simple start screen with "Get Started" + "How It Works"
2. **Clicks "Get Started"** → Soccer field opens with center overlay
3. **Center Overlay Shows** → "Valmis aloittamaan? Lisää ensin pelaajia joukkueeseesi, jotta voit luoda ensimmäisen ottelusi"
4. **Clicks "Set Up Team Roster"** → Roster modal opens
5. **Adds Players** → Returns to field, center overlay updates
6. **New Overlay Shows** → "Kaikki valmista ensimmäiseen otteluun! Nyt voit luoda ensimmäisen ottelusi..."
7. **Two Clear Options**:
   - "Create Your First Match" (primary)
   - "Create Season/Tournament First" (secondary)
8. **Creates Game** → Center overlay disappears, normal gameplay begins
9. **Returns to Start Screen** → Full interface now available with all smart buttons

#### Journey B: User with Players but No Games

1. **App Opens** → Simple start screen (still first-time user because no saved games)
2. **Clicks "Get Started"** → Soccer field opens
3. **Center Overlay Shows** → "Kaikki valmista ensimmäiseen otteluun!" with game creation options
4. **Skips straight to game creation** → No roster setup needed
5. **Creates and saves game** → Graduates to full interface

#### Journey C: Experienced User (Has Saved Games)

1. **App Opens** → Full smart button interface immediately
2. **All buttons show contextual states**:
   - Resume Last Game (enabled/disabled based on availability)
   - Create Game with smart text ("New" vs "First")
   - All features accessible with proper prerequisites shown
3. **No center overlay interference** → Direct access to all functionality

### Technical Implementation Benefits

#### Performance Optimizations
- ✅ **Single state check** determines interface mode (just `!hasSavedGames`)
- ✅ **Conditional rendering** prevents unnecessary DOM elements
- ✅ **No redundant API calls** - state checked once at initialization
- ✅ **Efficient translations** - only load needed text for current mode

#### Maintenance Advantages
- ✅ **Clear separation** between first-time and experienced user code paths
- ✅ **Easy to extend** - new features can easily add their own state checks
- ✅ **Self-documenting** - code structure matches user experience flow
- ✅ **Testable** - clear input/output relationships for unit testing

#### User Experience Metrics
- ✅ **Zero abandonment** - no dead-end states or confusing options
- ✅ **Natural progression** - each step unlocks logically from previous
- ✅ **Clear mental model** - users understand app structure through guided discovery
- ✅ **Reduced support** - self-explanatory interface reduces user questions

## 9. Dual-Mode Start Screen System (Complete Implementation)

### Overview
The dual-mode start screen system represents the culmination of MatchOps Local's first-time user experience strategy. This system automatically detects user experience level and presents either a simplified interface for new users or a full-featured interface for experienced users, eliminating first-time user confusion while preserving power user efficiency.

### Core Architecture

#### 1. State Detection System (`src/app/page.tsx:18-54`)

**Refined Detection Logic (Updated)**:
```typescript
// State variables checked asynchronously
const [canResume, setCanResume] = useState(false);
const [hasPlayers, setHasPlayers] = useState(false);  
const [hasSavedGames, setHasSavedGames] = useState(false);
const [hasSeasonsTournaments, setHasSeasonsTournaments] = useState(false);

// Simplified first-time user detection - based on saved games only
const isFirstTimeUser = !hasSavedGames;
```

**Rationale for Simplified Detection**:
The detection was refined to focus solely on saved games rather than a complex combination of factors. This creates a cleaner user progression:
- **No saved games** = Simplified "Get Started" interface (regardless of roster or seasons)
- **Has saved games** = Full-featured interface with all smart buttons

**Data Sources Checked**:
- **Resume capability**: `getCurrentGameIdSetting()` + `getSavedGames()`
- **Player roster**: `getMasterRoster()` length check
- **Game history**: `getSavedGames()` object keys length
- **Season/tournament data**: `getSeasons()` + `getTournaments()` length checks

**State Persistence**: All checks happen at app initialization in single async operation for optimal performance.

#### 2. Interface Mode Switching (`src/components/StartScreen.tsx:123-196`)

**Conditional Rendering Structure**:
```jsx
{isFirstTimeUser ? (
  /* FIRST-TIME USER: Simplified Interface */
  <div className="w-full flex flex-col items-center justify-center flex-1 px-4 py-8 gap-6 max-w-sm mx-auto">
    {/* Large Get Started button */}
    <button className="w-full px-6 py-4 rounded-lg text-lg font-bold...">
      {t('startScreen.getStarted', 'Get Started')}
    </button>
    
    {/* Secondary help button */}
    <button onClick={() => setIsInstructionsModalOpen(true)}>
      {t('startScreen.howItWorks', 'How It Works')}
    </button>
  </div>
) : (
  /* EXPERIENCED USER: Full-Featured Interface */
  <div className="w-full flex flex-col items-center justify-center flex-1 px-4 py-6 gap-1.5 max-w-sm mx-auto">
    {/* All smart buttons with conditional states */}
  </div>
)}
```

#### 3. Simplified Interface Design (First-Time Users)

**Visual Layout**:
```
┌─────────────────────────────┐
│        MatchOps Local       │
│     Plan · Record · Assess  │
│         ─────────          │
│                            │
│    🎯 [Get Started]        │ ← Large primary action
│                            │
│    📚 [How It Works]       │ ← Secondary help
│                            │
│         [EN] [FI]          │
└─────────────────────────────┘
```

**Key Design Principles**:
- **Single primary action**: "Get Started" button dominates interface
- **Larger spacing**: `gap-6` vs `gap-1.5` for experienced users
- **Bigger button**: `px-6 py-4 text-lg font-bold` for primary action
- **Cleaner hierarchy**: Only essential actions visible
- **Zero disabled buttons**: No broken or grayed-out UI elements

#### 4. Full-Featured Interface (Experienced Users)

**Smart Button System**: All buttons adapt based on user data state:

```jsx
{/* Resume/Explore - Always enabled, smart text */}
<button onClick={canResume && onResumeGame ? onResumeGame : onExploreApp}>
  {canResume ? t('startScreen.resumeGame') : t('startScreen.exploreApp')}
</button>

{/* Create Game - Smart text, conditional enabling */}
<button 
  className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
  disabled={!hasPlayers}
>
  {hasSavedGames ? t('startScreen.createNewGame') : t('startScreen.createFirstGame')}
</button>

{/* Setup Roster - Conditional visibility */}
{!hasPlayers && (
  <button onClick={onSetupRoster}>
    {t('startScreen.setupRoster')}
  </button>
)}
```

#### 5. Action Handler Integration (`src/app/page.tsx:56-67`)

**Enhanced Action System**:
```typescript
const handleAction = (
  action: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'getStarted' | 'season' | 'stats' | 'roster'
) => {
  // Special handling for first-time user "Get Started"
  if (action === 'getStarted') {
    setInitialAction(null); // Let natural onboarding flow take over
  } else {
    setInitialAction(action);
  }
  setScreen('home');
};
```

**First-Time User Journey**:
1. User clicks "Get Started" → `handleAction('getStarted')`
2. `initialAction = null` → No forced modal opens
3. Natural flow to soccer field with center overlay guidance
4. Existing onboarding system takes over seamlessly

#### 6. Modal Integration System

**InstructionsModal Implementation** (`src/components/StartScreen.tsx:10, 45, 222-225`):
```jsx
// Import
import InstructionsModal from '@/components/InstructionsModal';

// State management
const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);

// Component rendering
<InstructionsModal
  isOpen={isInstructionsModalOpen}
  onClose={() => setIsInstructionsModalOpen(false)}
/>
```

**Benefits**:
- **Local help access**: No screen transitions needed
- **Consistent experience**: Same modal used throughout app
- **No navigation disruption**: Help opens in place, closes back to start screen

#### 7. Translation Architecture

**Smart Translation Keys** (`public/locales/*/common.json`):

```json
// English
"startScreen": {
  "getStarted": "Get Started",
  "howItWorks": "How It Works",
  "resumeGame": "Resume Last Game",
  "exploreApp": "Explore App",
  "createNewGame": "Create New Game",
  "createFirstGame": "Create First Game",
  "createSeasonTournament": "Seasons & Tournaments",
  "createFirstSeasonTournament": "First Season/Tournament"
}

// Finnish  
"startScreen": {
  "getStarted": "Aloita tästä",
  "howItWorks": "Näin se toimii",
  "resumeGame": "Jatka edellistä peliä",
  "exploreApp": "Tutustu sovellukseen",
  "createNewGame": "Luo uusi ottelu", 
  "createFirstGame": "Luo ensimmäinen ottelu",
  "createSeasonTournament": "Kaudet & Turnaukset",
  "createFirstSeasonTournament": "Ensimmäinen kausi/turnaus"
}
```

#### 8. State Transition System

**Progressive Feature Unlocking (Updated)**:
```
Fresh Install (isFirstTimeUser = true - no saved games)
├── Shows: Simplified interface with "Get Started" + "How It Works"
│
├── User clicks "Get Started" → Natural onboarding flow begins
├── Case A: No players → Center overlay: "Add players first"
├── Case B: Has players → Center overlay: "Ready to create first match!"
│
├── User creates and saves first game → hasSavedGames = true
├── isFirstTimeUser = false → Full smart button interface appears
│
├── Smart button text adapts based on user data:
├── "Create First Game" → "Create New Game" (when more games exist)
└── "Create Season/Tournament" (simplified from "First Season/Tournament")
```

**Automatic Adaptation**: Interface evolves naturally as user creates data, no manual configuration needed.

#### 9. Performance Optimizations

**Efficient State Management**:
- **Single async check**: All state determined in one `useEffect` operation
- **Conditional rendering**: Only needed UI elements created
- **Memoized calculations**: `isFirstTimeUser` calculated once per render
- **No redundant API calls**: State checked at app launch, cached thereafter

**Bundle Size Impact**:
- **Zero additional dependencies**: Uses existing components and systems
- **Shared translation system**: Leverages existing i18next infrastructure
- **Component reuse**: InstructionsModal shared across app

#### 10. Error Handling and Edge Cases

**Graceful Fallback System**:
```typescript
try {
  // Check for resume capability, players, games, seasons
  const [lastId, games, roster, seasons, tournaments] = await Promise.all([...]);
  // Set all state variables
} catch {
  // Default to safe fallback state
  setCanResume(false);
  setHasSavedGames(false);
  setHasPlayers(false);
  setHasSeasonsTournaments(false);
}
```

**Edge Case Handling**:
- **Corrupted localStorage**: Falls back to first-time user interface
- **Partial data**: Smart detection still works with incomplete state
- **Performance issues**: Async operations don't block UI rendering
- **Network offline**: All detection works offline (localStorage only)

### Benefits of Complete Implementation

#### User Experience Improvements
- ✅ **Zero learning curve**: New users have single clear path
- ✅ **No decision paralysis**: Overwhelming choices eliminated
- ✅ **Natural progression**: Features unlock as user gains experience
- ✅ **Expert efficiency**: Power users get full interface immediately
- ✅ **Context-sensitive help**: Guidance available without navigation

#### Technical Advantages  
- ✅ **Automatic detection**: No user settings or preferences needed
- ✅ **Progressive enhancement**: Works with any existing data state
- ✅ **Performance optimized**: Single state check, minimal overhead
- ✅ **Fully internationalized**: Complete English and Finnish support
- ✅ **Backward compatible**: Works with existing user data

#### Maintenance Benefits
- ✅ **Self-documenting code**: Clear conditional logic flow
- ✅ **Single source of truth**: State detection centralized
- ✅ **Easy to extend**: New states can be added to detection logic
- ✅ **Testable**: Clear input/output for unit testing
- ✅ **Future-proof**: Adapts automatically to new features

### Real-World Usage Scenarios

#### Scenario A: Brand New User
1. **Opens app** → `isFirstTimeUser = true`
2. **Sees simple interface** → "Get Started" + "How It Works"
3. **Clicks "Get Started"** → Main app opens with center overlay
4. **Gets guided through setup** → Roster creation → First game
5. **Returns to start** → Full interface now available

#### Scenario B: Existing User (Players Only)
1. **Opens app** → `hasPlayers = true`, `isFirstTimeUser = false`
2. **Sees full interface** → All buttons visible with smart states
3. **"Create First Game" enabled** → Clear next step
4. **Other features grayed out** → Visual progression indicator

#### Scenario C: Power User (All Data)
1. **Opens app** → All state true, `isFirstTimeUser = false`
2. **Sees full interface** → All buttons enabled
3. **Smart text everywhere** → "Create New Game", "Seasons & Tournaments"
4. **Resume button available** → Can continue last session immediately

### Future Enhancement Opportunities

#### Advanced Personalization
- **Usage pattern analysis**: Detect most-used features for prioritization
- **Custom interface modes**: Let advanced users customize button layout
- **Contextual suggestions**: Recommend actions based on recent activity

#### Enhanced Onboarding
- **Progressive disclosure animations**: Smooth transitions as features unlock
- **Achievement system**: Visual feedback for completing setup milestones
- **Smart recommendations**: Suggest next logical steps based on current state

#### Analytics Integration
- **User journey tracking**: Understand how first-time users progress
- **Feature adoption metrics**: Measure success of simplified interface
- **Performance monitoring**: Optimize state detection timing

## 8. External Matches System

### Overview
The local version implements a comprehensive external matches system that allows adding player statistics from games played outside of MatchOps tracking (e.g., games with other teams, tournaments not tracked in the app). This feature enables maintaining complete career statistics for players who participate in multiple teams or external competitions.

### Business Logic

#### Core Purpose
This feature solves a critical real-world problem: players often participate in multiple teams, tournaments, or special events that aren't tracked within MatchOps. Without this feature, coaches would have incomplete statistics for their players, missing valuable performance data from:
- National team games
- School team matches
- Tournament games with other clubs
- Guest appearances with other teams
- Training camps and friendly matches

#### Key Business Rules
1. **Flexible Association**: External games can be optionally linked to existing seasons or tournaments
2. **Team Context Preservation**: Tracks which team the player represented (external team name)
3. **Statistical Integrity**: External stats are transparently added to overall totals
4. **Selective Inclusion**: Option to include/exclude from season/tournament statistics based on team context
5. **Data Validation**: Prevents unrealistic entries (e.g., 20+ goals per game)
6. **Historical Accuracy**: Maintains game dates and scores for complete match history

### Technical Implementation

#### 1. Data Model

**PlayerStatAdjustment Interface** (`src/types/index.ts:64-83`):
```typescript
export interface PlayerStatAdjustment {
  id: string;
  playerId: string;
  seasonId?: string;                // Optional season association
  teamId?: string;                  // Optional team identifier
  tournamentId?: string;            // Optional tournament context
  externalTeamName?: string;        // Name of the team the player represented
  opponentName?: string;            // Name of the opponent team
  scoreFor?: number;                // Score for player's team
  scoreAgainst?: number;            // Score against player's team
  gameDate?: string;                // Date of the game(s)
  homeOrAway?: 'home' | 'away' | 'neutral';  // Game location context
  includeInSeasonTournament?: boolean;       // Include in season/tournament stats
  gamesPlayedDelta: number;         // Number of games to add
  goalsDelta: number;               // Number of goals to add
  assistsDelta: number;             // Number of assists to add
  note?: string;                    // Optional descriptive note
  createdBy?: string;               // User identifier
  appliedAt: string;                // Timestamp when adjustment was created
}
```

#### 2. Storage Layer

**Player Adjustments Manager** (`src/utils/playerAdjustments.ts`):
```typescript
// Core CRUD operations for external game stats
export const getAllPlayerAdjustments = async (): Promise<PlayerAdjustmentsIndex>
export const getAdjustmentsForPlayer = async (playerId: string): Promise<PlayerStatAdjustment[]>
export const addPlayerAdjustment = async (adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'>): Promise<PlayerStatAdjustment>
export const updatePlayerAdjustment = async (playerId: string, adjustmentId: string, patch: Partial<PlayerStatAdjustment>): Promise<PlayerStatAdjustment | null>
export const deletePlayerAdjustment = async (playerId: string, adjustmentId: string): Promise<boolean>
```

**Storage Structure**:
- Data persisted in localStorage under `PLAYER_ADJUSTMENTS_KEY`
- Indexed by player ID for efficient retrieval
- Each adjustment has unique ID with timestamp and random suffix

#### 3. Statistics Calculation

**Player Stats Calculator** (`src/utils/playerStats.ts`):
```typescript
export const calculatePlayerStats = (
  player: Player,
  savedGames: { [key: string]: AppState },
  seasons: Season[],
  tournaments: Tournament[],
  adjustments?: PlayerStatAdjustment[]
): PlayerStats => {
  // ... process regular games ...
  
  // Apply external game adjustments
  const adjustmentsForPlayer = (adjustments || []).filter(a => a.playerId === player.id);
  
  adjustmentsForPlayer.forEach(adj => {
    // Only add to season/tournament stats if includeInSeasonTournament is true
    if (adj.includeInSeasonTournament) {
      if (adj.seasonId) {
        performanceBySeason[adj.seasonId].gamesPlayed += (adj.gamesPlayedDelta || 0);
        performanceBySeason[adj.seasonId].goals += (adj.goalsDelta || 0);
        performanceBySeason[adj.seasonId].assists += (adj.assistsDelta || 0);
      }
      if (adj.tournamentId) {
        performanceByTournament[adj.tournamentId].gamesPlayed += (adj.gamesPlayedDelta || 0);
        performanceByTournament[adj.tournamentId].goals += (adj.goalsDelta || 0);
        performanceByTournament[adj.tournamentId].assists += (adj.assistsDelta || 0);
      }
    }
    // Stats always count toward overall totals regardless of includeInSeasonTournament flag
  });
  
  // Add adjustments to total calculations
  const totalGoals = gameByGameStats.reduce((sum, game) => sum + game.goals, 0) 
                     + adjustmentsForPlayer.reduce((s, a) => s + (a.goalsDelta || 0), 0);
  const totalAssists = gameByGameStats.reduce((sum, game) => sum + game.assists, 0) 
                       + adjustmentsForPlayer.reduce((s, a) => s + (a.assistsDelta || 0), 0);
  const totalGames = gameByGameStats.length 
                     + adjustmentsForPlayer.reduce((s, a) => s + (a.gamesPlayedDelta || 0), 0);
}
```

### User Interface & Styling

#### 1. Main UI Component (`src/components/PlayerStatsView.tsx`)

**Add External Stats Button** (Line 209-215):
```jsx
<button
  type="button"
  className="text-sm px-3 py-1.5 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600"
  onClick={() => setShowAdjForm(v => !v)}
>
  {t('playerStats.addExternalStats', 'Add external stats')}
</button>
```

**Form Layout** (Lines 217-386):
- **Container**: Dark semi-transparent background with border (`bg-slate-800/60 p-4 rounded-lg border border-slate-600`)
- **Grid System**: Responsive 3-column layout (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`)
- **Input Fields**: Dark theme inputs with focus states (`bg-slate-700 border-slate-600 focus:ring-2 focus:ring-indigo-500`)

#### 2. Key Form Elements

**Home/Away Selector** (Lines 287-300):
```jsx
<select value={adjHomeAway} onChange={e => setAdjHomeAway(e.target.value as 'home' | 'away' | 'neutral')}
  className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm">
  <option value="home">{t('playerStats.home', 'Home')}</option>
  <option value="away">{t('playerStats.away', 'Away')}</option>
  <option value="neutral">{t('playerStats.neutral', 'Neutral')}</option>
</select>
```

**Score Input with Dynamic Labels** (Lines 322-332):
```jsx
<div className="flex items-center gap-2">
  <input type="number" value={getLeftScore()} onChange={e => setLeftScore(e.target.value)}
    className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1" />
  <span className="mx-1 text-lg font-bold">-</span>
  <input type="number" value={getRightScore()} onChange={e => setRightScore(e.target.value)}
    className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1" />
</div>
```
- Score labels dynamically swap based on home/away selection
- Visual feedback shows which team is home/away

**Numeric Input with +/- Buttons** (Lines 338-343):
```jsx
<div className="flex items-center gap-2">
  <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600"
    onClick={() => setAdjGames(v => Math.max(0, v - 1))}>-</button>
  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjGames)}
    className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2" />
  <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600"
    onClick={() => setAdjGames(v => v + 1)}>+</button>
</div>
```
- Mobile-optimized with `inputMode="numeric"` for number keypads
- Increment/decrement buttons for easy touch interaction

**Include in Stats Checkbox** (Lines 361-376):
```jsx
<label className="flex items-center gap-2">
  <input type="checkbox" checked={adjIncludeInSeasonTournament}
    onChange={(e) => setAdjIncludeInSeasonTournament(e.target.checked)}
    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-600 border-slate-500 rounded" />
  <span className="text-xs text-slate-400">
    {t('playerStats.includeInSeasonTournament', 'Include in season/tournament statistics')}
  </span>
</label>
<p className="text-xs text-slate-500 mt-1 ml-6">
  {t('playerStats.includeInSeasonTournamentHelp', 'Check this if the external game was played for the same team')}
</p>
```

#### 3. External Stats Display (Lines 390-542)

**List Container**:
```jsx
<div className="mt-1 space-y-3">
  {adjustments.map(a => (
    <div key={a.id} className="bg-slate-700/40 p-3 rounded-lg border border-slate-600/50">
```

**Entry Header with Badges**:
```jsx
<div className="flex items-center gap-2">
  <span className="font-semibold text-slate-200">{dateText}</span>
  {seasonName && (
    <span className="px-2 py-0.5 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
      {seasonName}
    </span>
  )}
  {tournamentName && (
    <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 text-xs rounded-full border border-purple-500/30">
      {tournamentName}
    </span>
  )}
</div>
```

**Actions Menu** (3-dot menu):
```jsx
<button type="button" className="p-1 hover:bg-slate-600 rounded transition-colors"
  onClick={() => setShowActionsMenu(showActionsMenu === a.id ? null : a.id)}>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="2.5" r="1.5"/>
    <circle cx="8" cy="8" r="1.5"/>
    <circle cx="8" cy="13.5" r="1.5"/>
  </svg>
</button>
```

#### 4. Delete Confirmation Modal (Lines 694-728)

```jsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div className="bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-600 max-w-md w-full mx-4">
    <h3 className="text-lg font-semibold text-slate-100 mb-4">
      {t('common.confirmDelete', 'Confirm Delete')}
    </h3>
    <p className="text-slate-300 mb-6">
      {t('playerStats.deleteConfirmMessage', 'Are you sure you want to delete this external game entry?')}
    </p>
    <div className="flex justify-end gap-3">
      <button className="px-4 py-2 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600">
        {t('common.cancel', 'Cancel')}
      </button>
      <button className="px-4 py-2 bg-red-600 rounded hover:bg-red-500 text-white">
        {t('common.delete', 'Delete')}
      </button>
    </div>
  </div>
</div>
```

### Data Validation

**Comprehensive Input Validation**:
```typescript
// Required fields validation
if (!adjExternalTeam.trim()) {
  alert(t('playerStats.teamRequired', 'Team name is required.'));
  return;
}
if (!adjOpponentName.trim()) {
  alert(t('playerStats.opponentRequired', 'Opponent name is required.'));
  return;
}

// Sanity checks
if (adjGames < 0 || adjGoals < 0 || adjAssists < 0) {
  alert(t('playerStats.negativeStatsError', 'Stats cannot be negative.'));
  return;
}
if (adjGames === 0 && adjGoals === 0 && adjAssists === 0) {
  alert(t('playerStats.emptyStatsError', 'Please enter at least one statistic.'));
  return;
}

// Unrealistic data prevention
if (adjGames > 0 && adjGoals > adjGames * 20) {
  alert(t('playerStats.unrealisticGoalsError', 'Goals per game seems unrealistic.'));
  return;
}
if (adjGames > 0 && adjAssists > adjGames * 20) {
  alert(t('playerStats.unrealisticAssistsError', 'Assists per game seems unrealistic.'));
  return;
}
```

### Translation Support

**English** (`public/locales/en/common.json`):
```json
"playerStats": {
  "addExternalStats": "Add external stats",
  "externalTeam": "External team",
  "opponent": "Opponent",
  "home": "Home",
  "away": "Away", 
  "neutral": "Neutral",
  "score": "Score",
  "gameDate": "Game date",
  "gamesPlayed": "Games",
  "goals": "Goals",
  "assists": "Assists",
  "note": "Note",
  "noteOptional": "Optional note about this game",
  "includeInSeasonTournament": "Include in season/tournament statistics",
  "includeInSeasonTournamentHelp": "Check this if the external game was played for the same team",
  "adjustmentsInfo": "External stats are transparently added to totals.",
  "teamRequired": "Team name is required.",
  "opponentRequired": "Opponent name is required.",
  "negativeStatsError": "Stats cannot be negative.",
  "emptyStatsError": "Please enter at least one statistic.",
  "unrealisticGoalsError": "Goals per game seems unrealistic.",
  "deleteConfirmMessage": "Are you sure you want to delete this external game entry?"
}
```

**Finnish** (`public/locales/fi/common.json`):
```json
"playerStats": {
  "addExternalStats": "Lisää ulkoisia tilastoja",
  "externalTeam": "Ulkoinen joukkue",
  "opponent": "Vastustaja",
  "home": "Koti",
  "away": "Vieras",
  "neutral": "Neutraali",
  "score": "Tulos",
  "gameDate": "Pelin päivämäärä",
  "gamesPlayed": "Pelit",
  "goals": "Maalit",
  "assists": "Syötöt",
  "note": "Huomautus",
  "noteOptional": "Valinnainen huomautus pelistä",
  "includeInSeasonTournament": "Sisällytä kausi-/turnaustilastoihin",
  "includeInSeasonTournamentHelp": "Valitse tämä, jos ulkoinen peli pelattiin samalle joukkueelle",
  "adjustmentsInfo": "Ulkoiset tilastot lisätään läpinäkyvästi kokonaismääriin.",
  "teamRequired": "Joukkueen nimi vaaditaan.",
  "opponentRequired": "Vastustajan nimi vaaditaan.",
  "negativeStatsError": "Tilastot eivät voi olla negatiivisia.",
  "emptyStatsError": "Anna vähintään yksi tilasto.",
  "unrealisticGoalsError": "Maaleja per peli vaikuttaa epärealistiselta.",
  "deleteConfirmMessage": "Haluatko varmasti poistaa tämän ulkoisen pelin merkinnän?"
}
```

### User Flow

#### Adding External Game Stats

1. **Access Point**: User opens Player Stats View for any player
2. **Initiate Entry**: Clicks "Add external stats" button
3. **Form Display**: Expandable form appears below the button
4. **Required Data Entry**:
   - Select season (if exists) or tournament (optional)
   - Select home/away/neutral status
   - Enter team name (required)
   - Enter opponent name (required)
   - Enter score (optional but recommended)
   - Select game date (defaults to today)
5. **Stats Entry**:
   - Use +/- buttons or type to enter games played
   - Enter goals scored by the player
   - Enter assists made by the player
6. **Team Context Decision**:
   - Check "Include in season/tournament statistics" if game was for the same team
   - Leave unchecked if game was for a different team (stats still count in totals)
7. **Optional Note**: Add descriptive note about the game
8. **Save**: Click Save button to persist the adjustment

#### Viewing External Game Stats

1. **Automatic Display**: External game entries appear below the "Add external stats" button
2. **Visual Indicators**:
   - Date prominently displayed
   - Season/tournament badges if associated
   - Score display adapts to home/away context
   - Team and opponent names clearly shown
3. **Stats Summary**: Games, goals, and assists shown for each entry
4. **Note Display**: Any notes appear below the stats

#### Editing External Game Stats

1. **Access**: Click 3-dot menu on any external game entry
2. **Select Edit**: Choose "Edit" from dropdown menu
3. **Edit Form**: Same form as add, pre-populated with existing values
4. **Modify**: Change any values as needed
5. **Save**: Click Save to update the entry

#### Deleting External Game Stats

1. **Access**: Click 3-dot menu on any external game entry
2. **Select Delete**: Choose "Delete" from dropdown menu
3. **Confirmation Modal**: Safety dialog appears
4. **Confirm**: Click Delete button to permanently remove entry
5. **Stats Update**: Player totals automatically recalculated

### Benefits

- **Complete Career Tracking**: Maintains full statistics across all teams and competitions
- **Flexible Association**: Can link to specific seasons/tournaments or keep separate
- **Team Context Preservation**: Distinguishes between same-team and different-team games
- **Statistical Integrity**: External stats transparently integrated into totals
- **Data Validation**: Prevents unrealistic or invalid entries
- **Easy Management**: Full CRUD operations with intuitive UI
- **Mobile Optimized**: Touch-friendly controls and numeric keyboards
- **Audit Trail**: Each adjustment timestamped for tracking
- **Visual Clarity**: Badges and formatting make entries easy to understand

## Recent Updates (2025-08-22)

### Morning Session
- ✅ Enhanced smart start screen with season/tournament button logic
- ✅ Improved Finnish translations for clarity and action-orientation  
- ✅ Redesigned "How It Works" content focusing on user flow
- ✅ Fixed navigation issues keeping users on start screen
- ✅ Added "How It Works" to hamburger menu for universal access
- ✅ Strengthened alert system preventing duplicate/broken messages

### Afternoon Session - Comprehensive First-Time User System
- ✅ **NEW**: Implemented soccer field center overlay for first-game guidance
- ✅ **NEW**: Added conditional messaging based on roster state
- ✅ **NEW**: Created "experiment first" option with temporary workspace
- ✅ **NEW**: Designed persistent workspace warning banner at top of field
- ✅ **NEW**: Fixed logic inconsistency (removed "Load Game" from first game flow)
- ✅ **NEW**: Upgraded warning banner with proper button styling
- ✅ **NEW**: Added `hasUsedWorkspace` state tracking for better UX
- ✅ **NEW**: Comprehensive translation support for all new features
- ✅ **NEW**: Fixed PWA install prompt text from "Coaching Companion" to "MatchOps Local"
- ✅ **NEW**: Added spacing to install prompt modal for better visual balance

### Evening Session - Smart Interface & Documentation
- ✅ **NEW**: Implemented "Resume"/"Explore App" smart button transformation
- ✅ **NEW**: Added smart button text: "Create First Game" vs "Create New Game"  
- ✅ **NEW**: Added smart button text: "First Season/Tournament" vs "Seasons & Tournaments"
- ✅ **NEW**: Restored missing roster-first functionality (Setup Team Roster button)
- ✅ **NEW**: Added proper button disabling when no players/games/seasons exist
- ✅ **NEW**: Implemented fluid button sizing system to fit screen properly
- ✅ **NEW**: Shortened button text for better visual balance
- ✅ **NEW**: Designed dual-mode start screen concept (simplified vs full-featured)
- ✅ **NEW**: Documented complete adaptive start screen system architecture
- ✅ **NEW**: Added comprehensive step-by-step technical implementation guide

### Night Session - Dual-Mode Start Screen Implementation
- ✅ **COMPLETED**: Full dual-mode start screen system implementation
- ✅ **COMPLETED**: First-time user detection logic with `isFirstTimeUser` state
- ✅ **COMPLETED**: Simplified interface for new users (Get Started + How It Works only)
- ✅ **COMPLETED**: Preserved full smart button interface for experienced users
- ✅ **COMPLETED**: InstructionsModal integration for local "How It Works" access
- ✅ **COMPLETED**: Translation keys for "Get Started" button (EN: "Get Started", FI: "Aloita tästä")
- ✅ **COMPLETED**: Conditional rendering system switching between interface modes
- ✅ **COMPLETED**: Integration with existing soccer field center overlay onboarding
- ✅ **COMPLETED**: Progressive feature unlocking as user creates data
- ✅ **COMPLETED**: Backward compatibility with existing user data and workflows

### Extended Night Session - Enhanced First-Time User Experience
- ✅ **REFINED**: Simplified first-time user detection to focus on saved games only (`!hasSavedGames`)
- ✅ **IMPROVED**: Finnish guidance language - clearer, more concise, action-oriented copy
- ✅ **ENHANCED**: Soccer field center overlay with "Create Season/Tournament First" option
- ✅ **REMOVED**: Temporary workspace option from onboarding (focus on proper workflow)
- ✅ **REMOVED**: Redundant helper text that cluttered the interface
- ✅ **FIXED**: Automatic instructions modal prevention for first-time users clicking "Get Started"
- ✅ **UPGRADED**: Start screen button design - bigger, more modern, better hierarchy
- ✅ **SIMPLIFIED**: Season/tournament button text ("Luo kausi/turnaus" vs "Ensimmäinen...")
- ✅ **RESTORED**: Honest "Resume Last Game" button (dimmed when unavailable) vs "Explore App"
- ✅ **OPTIMIZED**: Start screen layout spacing and visual balance
- ✅ **ENHANCED**: Translation quality ("Näin äppi toimii" for better Finnish clarity)
- ✅ **DOCUMENTED**: Comprehensive technical implementation guide for entire workflow