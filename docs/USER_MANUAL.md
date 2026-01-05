# MatchOps User Manual

**Your complete guide to managing soccer and futsal games**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Main Screen](#the-main-screen)
3. [Game Day Workflow](#game-day-workflow)
4. [Managing Your Roster](#managing-your-roster)
5. [Teams & Organization](#teams--organization)
6. [During the Game](#during-the-game)
7. [Tactics Board](#tactics-board)
8. [After the Game](#after-the-game)
9. [Data Management](#data-management)
10. [Troubleshooting](#troubleshooting)
11. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### First Launch

When you first open MatchOps, you'll see the **Adaptive Start Screen**:

**New Users** see a guided setup:
1. Language selection (English/Finnish)
2. Prompt to add your first players
3. Option to create your first game

**Returning Users** see quick actions:
- Continue last game
- Start new game
- Load saved game

### Installing as an App (Recommended)

MatchOps works best when installed as an app on your device:

**On Android/Chrome:**
1. Open MatchOps in Chrome
2. Tap the menu (three dots)
3. Select "Install app" or "Add to Home screen"

**On iOS/Safari:**
1. Open MatchOps in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

Once installed, MatchOps works offline and keeps your screen awake during games.

---

## The Main Screen

### Layout Overview

```
┌─────────────────────────────────────┐
│           Game Info Bar             │  ← Team names, score, period
├─────────────────────────────────────┤
│                                     │
│           Soccer Field              │  ← Drag players here
│                                     │
├─────────────────────────────────────┤
│           Player Bar                │  ← Available players
├─────────────────────────────────────┤
│           Control Bar               │  ← Timer, menu, tools
└─────────────────────────────────────┘
```

### Control Bar Buttons

| Button | Action |
|--------|--------|
| Tactics | Enter tactics/drawing mode |
| Formation | Place players in preset formations |
| Timer | Open large timer overlay |
| Reset | Clear all players from field |
| Menu | Open main menu |

---

## Game Day Workflow

### Pre-Game Setup (5 minutes before)

1. **Open the Menu** (hamburger icon)
2. **Tap "New Game"**
3. **Fill in game details:**
   - Your team name (auto-fills if set)
   - Opponent name
   - Game date
   - Season/Tournament (optional)
   - Game type: Soccer or Futsal

4. **Tap "Start Game"**

### Setting Your Lineup

**Method 1: Drag and Drop**
- Drag players from the Player Bar to the field
- Position them where they'll start

**Method 2: Formation Picker**
1. Select players in the Player Bar (tap to select)
2. Tap the Formation button
3. Choose a formation (4-3-3, 4-4-2, etc.)
4. Players auto-place on field

### Quick Roster Selection

If you have saved team rosters:
1. The app suggests your last used roster
2. Tap "Use Suggested Roster" to auto-load players

---

## Managing Your Roster

### Adding Players

1. **Menu → Manage Roster**
2. Tap **"+ Add Player"**
3. Enter player details:
   - Name (required)
   - Nickname (optional, shown on field)
   - Jersey number
   - Position/role
   - Is goalkeeper? (toggle)
4. Tap **"Save"**

### Editing Players

1. Tap a player in the roster list
2. Edit their details
3. Tap **"Save"**

### Player Colors

Each player has a color for their disc on the field:
- Default: Auto-assigned team color
- Custom: Tap color picker to choose

### Importing Players

If you have player data from elsewhere:
1. **Menu → Backup & Restore**
2. Use **Import** to load from JSON file

---

## Teams & Organization

### Creating Teams

Organize players into teams (useful for coaching multiple teams):

1. **Menu → Manage Teams**
2. Tap **"+ New Team"**
3. Enter team name and color
4. Add players to the team roster

### Switching Teams

When starting a new game:
- Select which team you're playing with
- Only that team's players show in Player Bar

### Seasons & Tournaments

Track games by season or tournament:

1. **Menu → Manage Seasons & Tournaments**
2. Create a season (e.g., "Spring 2026")
3. Create tournaments within seasons
4. When creating games, assign them to season/tournament

**Benefits:**
- Filter game history by season
- See season-specific player stats
- Track tournament progress

---

## During the Game

### Starting the Timer

1. Tap the **timer display** in the Control Bar
2. The **Timer Overlay** opens full-screen
3. Tap **Start** to begin

### Timer Controls

| Button | Action |
|--------|--------|
| Start/Pause | Toggle timer |
| +1 / -1 | Adjust minutes |
| Period buttons | Switch period |
| Close (X) | Return to field view |

**Note:** The timer continues running even if you close the overlay.

### Recording Goals

**Quick Method:**
1. Tap the score area in Game Info Bar
2. Tap **+** for the scoring team
3. Goal recorded with timestamp

**Detailed Method:**
1. **Menu → Stats → Goal Log**
2. Tap **"+ Add Goal"**
3. Select:
   - Scoring team
   - Scorer (optional)
   - Assister (optional)
   - Goal type (open play, penalty, etc.)

### Making Substitutions

1. **Drag** a player off the field (back to Player Bar)
2. **Drag** the substitute onto the field
3. Substitution logged automatically

### Undo Mistakes

Made an error? Use **Undo**:
1. Enter Tactics mode (tap Tactics button)
2. Tap the **Undo** arrow
3. Action reversed

**Keyboard shortcut:** Ctrl/Cmd + Z

---

## Tactics Board

The Tactics Board lets you draw plays and plan strategies.

### Entering Tactics Mode

1. Tap **Tactics** button in Control Bar
2. Screen switches to tactics view
3. Drawing mode auto-enables

### Drawing Tools

- **Draw**: Touch and drag to draw lines
- **Colors**: Drawings appear in yellow
- **Clear**: Tap eraser to clear all drawings

### Adding Tactical Elements

| Button | Action |
|--------|--------|
| Purple + | Add home team disc |
| Red + | Add opponent disc |
| Eraser | Clear all drawings |
| Reset | Clear field completely |

### Field Variations

In Game Settings, choose field view:
- **Full field**: Standard view
- **Half field**: Attacking/defending half
- **Quarter field**: Corner situations

### Saving Tactics

Tactics are saved with your game automatically. Load a game to restore its tactical setup.

---

## After the Game

### Saving the Game

Games auto-save as you play. To manually save:
1. **Menu → Save**
2. Game saved with current state

### Viewing Stats

1. **Menu → Stats**
2. See game statistics:
   - Score by period
   - Goal timeline
   - Player minutes played
   - Substitution history

### Assessing Players

Rate player performance after games:

1. **Menu → Assess Players**
2. Select a player
3. Rate on 10 dimensions:
   - Intensity, Courage, Duels
   - Technique, Creativity, Decisions
   - Awareness, Teamwork, Fair Play, Impact
4. Add notes
5. Tap **Save**

### Exporting Game Data

Share game data with other coaches:
1. **Menu → Backup & Restore**
2. Tap **"Export Games"**
3. Select games to export
4. Download JSON file

---

## Data Management

### Backup & Restore

**Creating a Backup:**
1. **Menu → Backup & Restore**
2. Tap **"Create Backup"**
3. File downloads: `matchops-backup-YYYY-MM-DD.json`

**Restoring from Backup:**
1. **Menu → Backup & Restore**
2. Tap **"Restore from Backup"**
3. Select your backup file
4. Confirm (warning: overwrites current data)

**Recommendation:** Create backups regularly, especially before device changes.

### Importing Games

Import games from other coaches:
1. **Menu → Backup & Restore**
2. Tap **"Import Games"**
3. Select JSON file
4. Review import preview
5. Confirm import

### Deleting Games

1. **Menu → Load Game**
2. Find the game to delete
3. Swipe left or tap delete icon
4. Confirm deletion

---

## Troubleshooting

### Common Issues

**App shows blank screen after reopening:**
- The app auto-recovers from background
- If stuck, close and reopen the app
- Your data is safe (stored locally)

**Timer stopped unexpectedly:**
- Timer pauses when app goes to background on some devices
- Install as PWA for best timer reliability
- Timer state is saved and resumes on reopen

**Can't find my saved game:**
- Check the date filter in Load Game
- Games are sorted by most recent
- Use search to find by team name

**Players disappeared from field:**
- Tap Reset Field button
- Reload the game from Load Game menu
- Players are in your roster, just not placed

**Storage full warning:**
- Export and delete old games
- Create backup before clearing data
- MatchOps uses ~50MB typically

### Data Recovery

If something goes wrong:
1. **Check Load Game** - your game may be there
2. **Restore from backup** - if you have a recent backup
3. **Browser storage** - data is in IndexedDB (persists across sessions)

### Performance Tips

- Close other browser tabs during games
- Install as PWA for best performance
- Clear old games you don't need

---

## Tips & Best Practices

### Game Day Checklist

- [ ] Charge your device
- [ ] Install MatchOps as PWA
- [ ] Create game beforehand with opponent name
- [ ] Set up initial formation
- [ ] Test timer works

### Effective Roster Management

1. **Use nicknames** - Shorter names display better on discs
2. **Mark goalkeepers** - They get special disc styling
3. **Group by team** - Create teams for each age group you coach
4. **Regular cleanup** - Archive players who've left

### Making the Most of Stats

- **Record all goals** with scorers for accurate player stats
- **Use seasons** to compare performance across time
- **Assess players** after games while memories are fresh
- **Export quarterly** for backup and analysis

### Tactics Board Tips

- Draw arrows by starting from player disc
- Use half-field view for set pieces
- Save games at key moments to preserve tactical setups
- Clear drawings before new plays (tap eraser)

### Multi-Device Usage

MatchOps runs locally on each device. To sync:
1. Create backup on Device A
2. Transfer backup file (email, cloud storage)
3. Restore backup on Device B

**Note:** Each device maintains separate data. Backup/restore is the sync method.

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Space | Start/pause timer (when timer open) |

### Menu Structure

```
Menu
├── Game Management
│   ├── Save
│   ├── Load Game
│   └── New Game
├── Setup & Configuration
│   ├── Game Settings
│   ├── Manage Roster
│   ├── Manage Teams
│   ├── Personnel Manager
│   └── Seasons & Tournaments
├── Analysis & Tools
│   ├── Stats
│   ├── Assess Players
│   ├── Training (Warmup Plan)
│   ├── Rules
│   └── Backup & Restore
├── Resources
│   ├── How It Works (Help)
│   └── External Links
└── Settings
    └── App Settings
```

### Supported Languages

- English
- Finnish (Suomi)

Change language in **App Settings**.

---

## Getting Help

### In-App Help

Tap **Menu → How It Works** for contextual help covering:
- Player selection and field interactions
- Tactical view usage
- Quick actions
- Advanced features

### Offline Support

MatchOps works completely offline after first load:
- All features available
- Data stored locally
- No internet required during games

### Feedback

Found a bug or have a feature request?
- Visit the MatchOps documentation site
- Contact support through the app

---

*MatchOps - Professional soccer coaching tools in your pocket*
