# MatchOps Local

A comprehensive PWA for soccer coaches to manage rosters, track live game events, analyze detailed statistics, and design plays on an interactive tactics board. Built for the sideline, available on any device.

## Key Features

The app is designed to be an all-in-one digital assistant for game day, from pre-match planning to post-game analysis.

### ⚽ Tactics & Gameplay

*   **Enhanced Soccer Field:** Beautifully rendered field with realistic grass textures, mowing patterns, and professional lighting effects for an immersive coaching experience.
*   **Interactive Field:** Drag and drop players and opponents directly onto the pitch with refined visual styling and smooth animations.
*   **Dedicated Tactics Board:** Toggle to a clean, separate view for designing plays. Use colored discs (home, opponent, goalie) and a freehand drawing tool to illustrate strategies.
*   **Live Game Clock:** A simple and reliable timer with start, pause, and reset functionality, including a large overlay view for high visibility.
*   **Substitution Timer:** Set a custom interval to receive on-screen alerts, ensuring timely player rotations.
*   **Drawing & Annotation:** Draw directly on the field in both player view and tactics view to visualize runs and positions. Includes undo/redo support.
*   **Training Resources:** Access warmup plans and drills from a built-in modal, plus quick links to external coaching materials.

### 📊 Statistics & Analysis

*   **Live Event Logging:** Record goals (with scorer and assister), opponent goals, and Fair Play card awards as they happen.
*   **Comprehensive Stats Modal:** View detailed game information and player statistics in one place.
*   **Aggregate Views:** Filter stats by the current game, or see aggregated totals for an entire **Season**, **Tournament**, or **All-Time**.
*   **Sortable Player Data:** Instantly sort players by Games Played, Goals, Assists, Total Points, and Average Points per Game.
*   **Individual Player Deep-Dive:** Click any player to open a dedicated modal showing their complete game log and a **performance trend graph** for goals and assists over time.
*   **External Games Integration:** Add external games and statistics that weren't tracked in the app, with full team context, scores, and dates for comprehensive player records.
*   **Data Export:** Export stats for a single game or aggregated data to **JSON** or **CSV** for offline analysis or sharing.
*   **Performance Ratings:** Assess players after each match on key metrics and view averages and trend graphs. Enable *Weight by Difficulty* to factor in each game's demand level.

### 👥 Roster & Team Management

*   **Master Roster:** Maintain a persistent list of all your players, including names, jersey numbers, and goalie status.
*   **Multi-Team Support:** Create and manage multiple independent teams, each with their own roster and settings.
*   **Team-Specific Player Data:** Assign players to teams with team-specific jersey numbers, positions, and notes.
*   **Smart Roster Detection:** Intelligent UI that guides new users through setup and prevents empty roster scenarios.
*   **Match-Day Selection:** Easily select which players from the master roster are available for the current game.
*   **Season & Tournament Management:** Create and organize custom seasons and tournaments that work independently across all teams.
*   **Management Enhancements:** Store default game settings, assign default rosters, archive old competitions and view quick stats. Import or export season setups for easy reuse.
*   **Full Backup & Restore:** Safeguard your data by exporting and importing a single file containing all players, games, and settings.
*   **Automatic Backups:** Background process periodically saves a full backup file so your data stays safe even if you forget to export manually.
*   **Save & Load Games:** Save an unlimited number of game states and load them back at any time for review or continuation.

### 🚀 Technology & Usability

*   **Progressive Web App (PWA):** Installable on any device (desktop or mobile) for a native, offline-capable experience.
*   **Modern UI/UX:** Professional sliding side panel navigation with touch gestures, refined game cards with alternating surfaces, and intuitive three-dot action menus.
*   **Automatic Update Notifications:** A banner appears in-app when a new version is released, ensuring you're always using the latest features.
*   **Responsive Design:** A clean, touch-friendly interface that works seamlessly on tablets, phones, and laptops.
*   **Internationalization:** Full support for English and Finnish.
*   **Vercel Analytics:** Web analytics are enabled to help improve the user experience.
*   **Enhanced Settings:** Professional sliding settings panel with organized sections for easy navigation and configuration.

## Local-Only Features Documentation

This app includes several advanced local-only features. For detailed implementation guides, see:

### Core Features
- **[Seasons and Tournaments - Decoupled Architecture](docs/seasons-tournaments-decoupled.md)** - How seasons and tournaments work independently from team rosters, with complete data structures, storage implementation, and management UI.

- **[Smart Roster Detection and Guard Conditions](docs/smart-roster-detection.md)** - Intelligent detection logic that prevents empty roster scenarios and provides smart UI state management with comprehensive guard conditions.

- **[Team Management - Multi-Team Architecture](docs/team-management.md)** - Complete multi-team support system with independent rosters, player assignment, atomic operations, and team CRUD functionality.

### Additional Documentation
- **[Player Statistics System](docs/player-statistics.md)** - Comprehensive player tracking with aggregated statistics, performance trends, and external game integration.

- **[Game Data Management](docs/game-data-management.md)** - Save/load system, game state management, and data persistence architecture.

- **[PWA Features](docs/pwa-features.md)** - Progressive Web App implementation with offline support, install prompts, and update notifications.

### Architecture Overview
- **[React Query State Management](docs/react-query-state-management.md)** - Centralized data fetching and caching strategy using React Query.

- **[localStorage Implementation](docs/localstorage-implementation.md)** - Complete data persistence layer with async wrappers and error handling.

- **[Internationalization System](docs/internationalization-system.md)** - Full i18next implementation with English and Finnish support.

## Tech Stack

*   **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **UI Library:** [React 19](https://reactjs.org/)
*   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
*   **State Management:** [React Query](https://tanstack.com/query) with React Hooks (`useState`, `useReducer`) & Custom Hooks
*   **Data Persistence:** Browser `localStorage` API with async wrappers
*   **Internationalization:** [i18next](https://www.i18next.com/) / [react-i18next](https://react-i18next.com/)
*   **PWA:** Custom Service Worker & Dynamic Web App Manifest
*   **Testing:** [Jest](https://jestjs.io/) with [React Testing Library](https://testing-library.com/)
*   **Analytics:** [@vercel/analytics](https://vercel.com/analytics)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/VillePajala/soccer-pre-game-app.git
    cd soccer-pre-game-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) with your browser to start using the app.

   When launched, a **Start Screen** appears with options to start a new game, load an existing one, create a season or tournament, or view statistics. Select an action to continue to the main field view.

## Development Commands

### Core Commands
- `npm run dev` - Start development server (Next.js)
- `npm run build` - Build for production (includes manifest generation)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run all Jest tests (executes `jest`)
- `npm run test:unit` - Alias for `npm test`
- `npm run generate:i18n-types` - Generate TypeScript types for translations

### Build Process
The build process includes a custom manifest generation step that runs before Next.js build:
- `node scripts/generate-manifest.mjs` - Generates PWA manifest based on branch
- Manifest configuration varies by branch (master vs development) for different app names and themes

## Running Tests

Install project dependencies with `npm install` as shown above. Then execute the automated test suite with:

```bash
npm test
# or
npm run test:unit
```

The tests rely on [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

### Testing Strategy
- Unit tests cover utilities and components and are co-located with source files using the `.test.tsx` suffix
- The Jest configuration excludes Playwright specs located in the `/tests/` directory

## Architecture Overview

### Data Flow
The app's data layer relies on **React Query** to fetch, cache, and manage server-side state (persisted in localStorage). Asynchronous wrappers in `src/utils/localStorage.ts` are used for direct localStorage access. This approach centralizes data fetching and reduces manual state management.

### PWA Structure
The app is a full PWA with:
- Custom service worker (`public/sw.js`)
- Dynamic manifest generation based on git branch
- Install prompts and update notifications

### State Management
- **`src/app/page.tsx`**: Acts as the central orchestrator, bringing together different state management strategies.
- **`useReducer` (`useGameSessionReducer.ts`)**: Manages the core game session state, including score, timer, periods, and game metadata. This provides predictable state transitions.
- **`useGameState` hook**: Manages the interactive state of the soccer field, including player positions on the field and drawings.
- **React Query**: Handles all asynchronous data operations, such as fetching and updating the master roster, seasons, tournaments, and saved games.
- **`useState`**: Used for managing local UI state within components (e.g., modal visibility).

### Key Components
- `SoccerField` - Interactive drag-and-drop field
- `PlayerBar` - Player roster management
- `ControlBar` - Main app controls
- Various modals for game settings, stats, and management

### Data Persistence
All data is stored in browser localStorage with async wrappers in `src/utils/localStorage.ts`. Key data includes:
- Player roster (`src/utils/masterRosterManager.ts`)
- Game saves (`src/utils/savedGames.ts`)
- Seasons and tournaments (`src/utils/seasons.ts`, `src/utils/tournaments.ts`)
- App settings (`src/utils/appSettings.ts`)

## Key Files to Understand

- `src/app/page.tsx` - The main component that orchestrates the entire application, integrating hooks, reducers, and data fetching.
- `src/hooks/useGameSessionReducer.ts` - The reducer managing core game logic (timer, score, status). Crucial for understanding state transitions.
- `src/hooks/useGameState.ts` - The hook for managing interactive state on the soccer field (player positions, drawings).
- `src/utils/masterRosterManager.ts` - Handles all CRUD operations for the master player list, interacting with localStorage.
- `src/config/queryKeys.ts` - Defines the keys used for caching and invalidating data with React Query.
- `src/types/index.ts` - Core TypeScript interfaces (Player, Season, Tournament, AppState).
- `src/utils/localStorage.ts` - Async localStorage wrapper utilities.

## Important Notes

### Data Storage
All your data is stored in your browser's `localStorage`. This enables:
- **Fast Performance:** Instant data access without network requests
- **Offline Capability:** Full functionality without internet connection
- **Privacy:** All data remains on your device

**Important:** Clearing your browser data will erase everything. **Use the "Full Backup" feature regularly!**

The app includes backup/restore functionality through `src/utils/fullBackup.ts`.

### Internationalization
The app supports English and Finnish with i18next. All translation files now live in `public/locales/`.

### PWA Features
The app includes install prompts, update notifications, and works offline. The service worker is updated during build to trigger cache updates.

### Offline Use
To get the best experience, install the app on your device when prompted by your browser ("Add to Home Screen" on mobile, or an install icon in the address bar on desktop).

---

*This project is under active development. Feel free to contribute or report issues!*

## License

This project is the exclusive intellectual property of Ville Pajala.  
All rights reserved. No part of this codebase may be copied, reused, or distributed without explicit permission.

## Contributions

By contributing to this project, you agree to transfer all IP rights of your contributions to Ville Pajala.  
See [CONTRIBUTING.md](./CONTRIBUTING.md) for full terms.