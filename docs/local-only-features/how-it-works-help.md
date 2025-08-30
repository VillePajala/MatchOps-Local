# "How It Works" Help Content

## Overview
Comprehensive help system with contextual, flow-based guidance accessible from multiple entry points. Recently restructured into pre-game, during-game, and post-game workflows with expanded 7-step process.

## Access Points
- **Start Screen**: "How It Works" button opens `InstructionsModal`
- **Hamburger Menu**: Resources section → "How It Works" link
- **Control Bar**: Question mark icon for contextual help

## Content Structure (Updated 2024)

### Pre-Game Setup (Steps 1-5)
1. **Create Roster**: Master player registry with detailed explanations
2. **Create Teams (Optional)**: Multi-squad organization with examples
3. **Create Tournament/Season (Optional)**: Competition structure with separate statistics
4. **Start New Game**: Configuration and linking with context
5. **Plan Formation**: Drag mechanics, goalkeeper setup, positioning strategy

### During the Game (Steps 6-7)  
6. **Tactical Planning**: Drawing tools, routes, game situation capture
7. **Live Tracking**: Real-time events, timing, substitution management

### After the Game
- Game preservation (automatic/manual)
- Player development tracking with notes  
- Comprehensive statistics review
- Data export capabilities
- Game review functionality

### Main Concepts Section
New educational content explaining core terminology:
- **Game**: Individual match with complete data
- **Roster**: Master player pool concept
- **Team**: Reusable player groups
- **Season/Tournament**: Statistical organization
- **Statistics**: Performance metrics explanation

## Files
- **Modal Component**: `src/components/InstructionsModal.tsx`
- **Translations**: `public/locales/*/common.json` under `instructionsModal.*`
- **Start Screen**: `src/components/StartScreen.tsx`

## Translation Keys (Restructured)
- `instructionsModal.preGame.*` - Pre-game workflow
- `instructionsModal.duringGame.*` - Live game actions
- `instructionsModal.afterGameSection.*` - Post-game activities  
- `instructionsModal.mainConcepts.*` - Core terminology
- `instructionsModal.keyFeatures.*` - Unique capabilities
- `instructionsModal.tips.*` - Pro tips section

## Content Strategy Improvements
- **Logical Phasing**: Matches actual user workflow progression
- **Expanded Descriptions**: Detailed context and use cases for each step
- **Reduced Repetition**: Consolidated similar information
- **Educational Focus**: Explains both "how" and "why" of features
- **Multi-language Support**: Comprehensive Finnish translations with correct terminology
