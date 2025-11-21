<div align="center">
  <img src="public/logos/app-logo-yellow.png" alt="MatchOps-Local Logo" width="200"/>
</div>

# MatchOps-Local

**A local-first soccer coaching PWA that puts coaches in control of their data**

[![License](https://img.shields.io/badge/license-All_Rights_Reserved-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3+-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/tests-1593+-green.svg)](#)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5a0fc8.svg)](https://web.dev/progressive-web-apps/)

---

## 📊 Project at a Glance

- **111,709 lines** of code (78K source + 33K tests)
- **64 components** with **1,593 tests** across 128 suites
- **3,450+ test assertions** ensuring quality
- **42% test-to-code ratio** (excellent coverage)
- **1,771 commits** across 5 contributors
- **Zero FIXME comments** - clean, maintained codebase
- **98% Tailwind CSS** - consistent, maintainable styling
- **Full TypeScript** - 100% type safety
- **140 documentation files** - comprehensive guides

📈 [**View Detailed Project Statistics →**](PROJECT_STATS.md)

---

## What is MatchOps-Local?

MatchOps-Local is a comprehensive Progressive Web App (PWA) designed specifically for soccer coaches who want **complete control over their team data** while maintaining the convenience of modern web applications. Unlike cloud-based alternatives, MatchOps-Local stores all data locally on your device, ensuring **privacy, reliability, and instant performance**.

### 🔑 Key Differentiators

- **🔒 Complete Privacy**: All data stays on your device - no external servers, no tracking, no data collection
- **⚡ Instant Performance**: Sub-second response times with local data access
- **📴 Offline First**: Full functionality without internet connection
- **💰 Zero Ongoing Costs**: No subscriptions, no per-user fees, install once and use forever
- **⚽ Soccer-Specific**: Purpose-built for soccer coaching workflows and needs

## 📋 Complete Coaching Workflow: Plan, Track, Assess

MatchOps-Local supports coaches through the complete game cycle with three integrated phases:

### 🎯 **Plan** (Pre-Game)
Before the game, organize your coaching staff, set up teams, and prepare rosters. The **Personnel Management** system helps you maintain a global database of coaches, trainers, and support staff across all your teams. The **Team Management** system lets you create multiple teams from your master roster, while **Season & Tournament** organization helps you structure your competitive calendar.

### ⚽ **Track** (In-Game)
During the game, use the **Interactive Field** to visualize player positions, manage substitutions with the **Live Timer** (including visual alerts and substitution tracking), and log important events like goals and assists in real-time. The **Tactics Board** lets you draw plays and communicate adjustments without disrupting the game flow.

### 📊 **Assess** (Post-Game)
After the game, review comprehensive **Player Statistics** (goals, assists, playtime across games, seasons, and tournaments), conduct detailed **Performance Assessments** across multiple dimensions (technical, tactical, physical, mental), and analyze trends with advanced filtering by season, tournament, or team. Track player development over time and gain insights to guide training priorities.

---

## 🚀 Core Features

### 🎯 **PLAN: Pre-Game Preparation**

#### 👥 **Personnel Management**
- **Global Staff Database**: Maintain a centralized database of all coaching staff across teams
  - Head Coach, Assistant Coach, Goalkeeper Coach
  - Fitness Coach, Physiotherapist, Team Manager
  - Support Staff and other customizable roles
- **Contact Information Management**: Store phone numbers, emails, certifications, and notes for each staff member
- **Game Assignments**: Select specific personnel for each game from your global pool
- **Cross-Team Support**: Same personnel can work with multiple teams without data duplication
- **Bilingual Interface**: Full English and Finnish language support

#### 👥 **Team Management**
- **Master Roster System**: Central player database shared across all teams
  - Add, edit, and remove players with goalie designation
  - Player name and nickname support for field display
  - Jersey number assignment
  - Player notes and development tracking
- **Multi-Team Support**:
  - Create and manage unlimited independent teams
  - Build team rosters from master player database
  - Team duplication with full roster copy
  - Team-specific settings and configurations
  - Impact analysis before team deletion (shows affected games)
- **Game Roster Selection**: Choose specific players and personnel for each game

#### 🏆 **Season & Tournament Organization**
- **Season Management**:
  - Create seasons with custom date ranges (e.g., Fall 2024: Sep - Dec)
  - Club season filtering for winter/summer schedules
  - Season-specific settings and statistics
  - Detailed season management modals
- **Tournament Tracking**:
  - Create tournaments with winners and awards
  - Tournament player recognition (Fair Play Trophy, Player of Tournament, etc.)
  - Performance statistics per tournament
  - Tournament details and management modals
- **Competition Association**: Link games to specific seasons or tournaments for organized tracking

### ⚽ **TRACK: In-Game Management**

#### 🗺️ **Interactive Soccer Field**
- **Drag-and-Drop Positioning**: Visual player placement with realistic field rendering
- **Field Tools Panel**: Quick access to field management
  - Place all selected players automatically in formation
  - Reset field to default state
  - Undo/Redo support for all field actions
  - Clear tactical drawings without resetting positions

#### ⏱️ **Live Game Timer**
- **Professional Timer Display**: Large overlay optimized for sideline visibility
- **Substitution Management**:
  - Configurable substitution intervals (1-20 minutes)
  - Time-since-last-substitution tracking
  - Visual alerts (warning at 1 minute, due when time reached)
  - Complete substitution history with timestamps
- **Period Tracking**: Multi-period game support with period transitions

#### 📝 **Real-Time Event Logging**
- **Goal Tracking**:
  - Record scorer and assist for every goal
  - Event timestamps synced with game timer
  - Inline editing via 3-dot menu
- **Opponent Tracking**:
  - Opponent goal recording
  - Inline opponent name editing during games
- **Event Management**: Edit or delete events with full confirmation workflow

#### 🎨 **Tactics Board**
- **Drawing Interface**: Dedicated tactical play design mode
  - Add/remove opponent players and tactical discs
  - Draw plays and movement patterns
  - Clear drawings without resetting field positions
- **View Modes**: Toggle between tactics view and standard player view
- **Undo/Redo**: Full history support for tactical changes

### 📊 **ASSESS: Post-Game Analysis**

#### 📈 **Comprehensive Player Statistics**
- **Performance Tracking**:
  - Goals, assists, appearances, and playtime tracking
  - Performance trends across games, seasons, and tournaments
  - Per-game statistics with sortable columns
  - Tournament-specific performance analysis
- **Game Statistics Modal**:
  - Overall statistics across all games
  - Current game stats with live updates
  - Season performance summaries
  - Tournament performance summaries
  - Player-focused view with season participation counts

#### 🔍 **Advanced Filtering & Analysis**
- **Multi-Dimensional Filtering**:
  - Filter by season, tournament, or team
  - Club season filtering (e.g., Oct-May for winter season)
  - Combined filters for detailed analysis
  - Player-specific game history view
- **Sortable Data Tables**: Sort by goals, assists, playtime, and more
- **Trend Analysis**: Identify performance patterns over time

#### 🎯 **Player Performance Assessment**
- **Multi-Dimensional Rating System**:
  - **Technical Skills**: Passing, shooting, dribbling, ball control
  - **Tactical Understanding**: Positioning, decision-making, game reading
  - **Physical Attributes**: Speed, stamina, strength, agility
  - **Mental Qualities**: Focus, attitude, teamwork, composure
- **Context Tracking**:
  - Weighted difficulty based on opponent strength
  - Game context captured (score, date, location, periods)
  - Historical assessment trends per player
  - Save and reset assessment functionality
- **Development Insights**: Track player growth across assessments

#### 🏆 **Tournament & Award System**
- **Recognition Tracking**:
  - Tournament player awards (Fair Play Trophy, etc.)
  - Tournament winner tracking
  - Season champions and performance highlights
- **Performance Statistics**: Detailed stats per competition

### 🎮 **User Experience**
- **Intuitive Interface**:
  - Clean, modern design with dark mode optimized for sideline use
  - Touch-optimized controls for mobile devices
  - Drag-to-close menus and modals
  - Keyboard shortcuts for common actions
- **Quick Access Menu**:
  - Organized sections: Game Management, Setup & Configuration, Analysis & Tools, Resources
  - Save/Load/New Game workflows
  - Direct access to all modals and settings
  - External links to coaching resources (Finnish FA materials, TASO platform)
- **Confirmation Modals**:
  - Non-blocking confirmations for destructive actions
  - WCAG 2.1 AA compliant with keyboard navigation
  - Focus management and ESC key support
- **Toast Notifications**: Context-aware success/error/info messages
- **Instructions Modal**: Built-in "How It Works" guide for new users

### 🛡️ **Data & Privacy**
- **IndexedDB Storage**:
  - High-performance browser storage (typically 50MB+ quota)
  - Automatic migration from legacy localStorage
  - Pause/resume/cancel migration controls
  - Memory-optimized batch processing
  - Cross-tab coordination with heartbeat mechanism
- **Complete Backup & Restore**:
  - One-click full backup export (JSON format)
  - Includes all data: teams, rosters, personnel, seasons, tournaments, and games
  - Data integrity verification with checksums
  - Import full backups with validation
  - Individual game import/export support
- **Game Import/Export**:
  - Flexible JSON-based game data format
  - Batch import support
  - Import results modal with success/failure reporting
- **Privacy by Design**:
  - Zero external data transmission (except opt-in error reporting via Sentry)
  - No personal data collection or processing
  - GDPR compliant
  - All data stays on device
- **Data Ownership**: Full control with comprehensive export capabilities

### 🔧 **Technical Features**
- **Progressive Web App**:
  - Install to home screen on mobile devices
  - Offline functionality with service worker caching
  - Auto-update detection with user prompt
  - App manifest with custom icons
  - Wake Lock API support (screen stays on during games)
- **Internationalization**:
  - English and Finnish language support
  - i18next-based translation system
  - Context-aware pluralization
- **Performance Optimizations**:
  - React Query for efficient data caching
  - Debounced auto-save (2-second intervals)
  - Memory pressure monitoring and optimization
  - Lazy loading and code splitting

## 🏗️ Technology Stack

- **Frontend**: Next.js 15.3+ with React 19 and TypeScript 5
- **Data Storage**: IndexedDB-first architecture with automatic legacy localStorage migration
- **State Management**:
  - React Query for server state and caching
  - useReducer for complex game logic
  - useState for local component state
- **Styling**: Tailwind CSS 4 for responsive, professional design
- **PWA**: Full Progressive Web App with offline capability, wake lock, and auto-updates
- **Error Monitoring**: Sentry integration for production error tracking (opt-in)
- **Testing**: 1,593 tests across 128 suites with Jest and React Testing Library
- **Internationalization**: i18next with English and Finnish support
- **Icons**: React Icons (Heroicons 2, Font Awesome)
- **Analytics**: Vercel Analytics integration for usage insights (production only)

## 📊 Project Status: Production Ready

MatchOps-Local has reached **production maturity** with enterprise-grade features and comprehensive testing. The application is actively used by soccer coaches with robust data management and error monitoring.

### ✅ **Core System Features**
- **Advanced Data Migration**: Enterprise-grade IndexedDB migration with pause/resume/cancel
- **Memory Management**: Intelligent memory pressure detection and optimization
- **Error Monitoring**: Production error tracking with Sentry integration (optional)
- **Comprehensive Testing**: 1,593 tests across 128 suites covering core workflows, edge cases, and accessibility
- **Performance Optimized**: Sub-second response times with intelligent caching

### ✅ **Production Quality**
- **Cross-Platform**: Works on all modern browsers and devices (Chrome, Firefox, Safari, Edge)
- **Offline Capable**: Complete functionality without internet connection
- **Data Safe**: Robust backup, recovery, and migration systems with integrity verification
- **Privacy Focused**: Zero external data transmission except optional error reporting
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation, ARIA attributes, and focus management
- **Mobile Optimized**: Touch-friendly controls, responsive design, installable as PWA

## 🔧 Recent Technical Achievements

### **Enterprise-Grade IndexedDB Migration System**
- **Advanced Migration Control**: Pause, resume, and cancel long-running migrations
- **Memory-Optimized Processing**: Intelligent batch sizing based on device memory
- **Progress Persistence**: Resume interrupted migrations across browser sessions
- **Statistical Estimation**: Real-time progress and completion time predictions
- **Background Processing**: Non-blocking migrations using RequestIdleCallback API
- **Tab Coordination**: Cross-tab migration locking with heartbeat mechanism

### **Production Monitoring & Quality Assurance**
- **Comprehensive Error Tracking**: Sentry integration with privacy-focused configuration
- **1,593 Test Suite**: Unit, integration, and accessibility tests across 128 suites
- **CI/CD Pipeline**: Automated linting, type-checking, testing, and build verification
- **Memory Leak Detection**: Advanced memory management with pressure monitoring
- **Build Optimization**: Production-ready builds with source map generation
- **Wake Lock Integration**: Screen stays on during active games for sideline coaching

### **UI/UX Improvements**
- **Modular Component Architecture**: GameStatsModal refactored from 1,625 lines to modular hooks and components
- **Consistent Design System**: Unified modal styling with gradient effects and proper spacing
- **3-Dot Action Menus**: Consistent dropdown pattern for Edit/Delete actions across modals
- **Accessibility Enhancements**: Full keyboard navigation, ARIA attributes, focus management
- **Toast System**: Non-blocking notifications replacing window.alert/window.confirm

### **Personnel Management System**
- **Global Staff Pool**: Centralized management of coaches, trainers, and support staff across all teams
- **Role-Based Organization**: Seven distinct staff roles (Head Coach, Assistant Coach, Goalkeeper Coach, Fitness Coach, Physiotherapist, Team Manager, Support Staff)
- **React Query Integration**: Real-time cache invalidation with optimistic updates for instant UI feedback
- **Cross-Team Personnel**: Same staff can work with multiple teams without data duplication
- **Contact Management**: Store phone numbers, emails, certifications, and notes for each staff member
- **Backup Integration**: Personnel data automatically included in full backup/restore system
- **Bilingual Support**: Complete English and Finnish translations for all personnel features

## 🚀 Quick Start

### Option 1: Use Hosted Version
Visit our hosted instance (link coming soon) - no installation required, works immediately in your browser.

### Option 2: Self-Host
1. Clone this repository
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`
4. Build for production: `npm run build`
5. Deploy static files to your web server

For detailed setup instructions, see [docs/deployment/](docs/deployment/).

## 🎯 Code Quality & Architecture

**Modern React architecture** with clean separation of concerns and comprehensive test coverage.

### Architecture Highlights
- **Container Pattern**: GameContainer, ModalManager, FieldContainer for clear responsibility separation
- **View-Model Separation**: Business logic cleanly separated from presentation
- **Centralized State**: Modal reducer eliminates race conditions
- **Test Coverage**: 1,593 tests across 128 suites covering core workflows, edge cases, and accessibility
- **Type Safety**: Full TypeScript coverage across entire codebase
- **Performance**: Sub-second response times with intelligent caching

**For developers**: See [CLAUDE.md](CLAUDE.md) for development guidelines and [docs/](docs/) for complete documentation.

## 📖 Documentation

### **New to MatchOps-Local?**
- **[Project Overview](docs/01-project/overview.md)** - What MatchOps-Local is and why it exists
- **[Local-First Philosophy](docs/01-project/local-first-philosophy.md)** - Why local-first matters for coaching software
- **[Competitive Analysis](docs/01-project/competitive-analysis.md)** - How we compare to other coaching software

### **Understanding the Project**
- **[Architecture Overview](docs/02-technical/architecture/)** - Technical design and system architecture
- **[Database Schema](docs/02-technical/database/)** - Current storage structure and data models
- **[Security & Privacy](docs/02-technical/security.md)** - Privacy-first design and security measures

### **For Developers**
- **[Contributing Guide](docs/05-development/)** - How to contribute to the project
- **[Development Guides](docs/05-development/)** - Code reviews, bug reports, and development processes
- **[Testing Strategy](docs/06-testing/)** - Comprehensive testing approach
- **[CLAUDE.md](CLAUDE.md)** - AI assistant guidance for development

### **Feature Documentation**
- **[Features Overview](docs/04-features/)** - Detailed feature specifications and implementation
- **[Team Management](docs/04-features/team-management.md)** - Multi-team architecture
- **[Seasons & Tournaments](docs/04-features/seasons-tournaments.md)** - Competition tracking

### **Complete Documentation**
Browse all documentation in the [docs/](docs/) directory:
- **[01-Project](docs/01-project/)** - Vision, philosophy, and strategic direction
- **[02-Technical](docs/02-technical/)** - Architecture and technical decisions
- **[03-Active Plans](docs/03-active-plans/)** - Current development roadmap
- **[04-Features](docs/04-features/)** - Feature specifications and plans
- **[05-Development](docs/05-development/)** - Contribution and development guides
- **[06-Testing](docs/06-testing/)** - Testing strategies and quality assurance

## 💬 Feedback & Improvements

While MatchOps-Local is proprietary software, we value feedback and may consider contributions under specific terms:

- **🏃 Coaches**: Provide feedback, bug reports, and feature suggestions
- **💻 Developers**: Review code and propose improvements (see [Contributing Guide](docs/05-development/contributing.md) for IP transfer terms)
- **🎨 Designers**: Suggest UX/UI enhancements
- **📣 Advocates**: Share the local-first philosophy

**Note**: All contributions transfer intellectual property rights to Ville Pajala. See [Contributing Guide](docs/05-development/contributing.md) for complete terms.

## 🌟 Why Local-First Matters

In an era of increasing data privacy concerns, MatchOps-Local demonstrates that powerful, modern applications can:
- **Protect user privacy** by keeping data local
- **Deliver superior performance** through local data access
- **Eliminate ongoing costs** without subscription dependencies
- **Work reliably offline** in any environment

For youth sports, where we handle information about minors, the local-first approach isn't just preferred—**it's essential**.

## 📄 License

**Copyright (c) 2025 Ville Pajala. All Rights Reserved.**

This software and all associated files are the exclusive intellectual property of Ville Pajala. No part of this repository may be used, copied, modified, or distributed without express written permission. See the [LICENSE](LICENSE) file for complete details.

## 🎯 Project Vision

**To establish MatchOps-Local as the premier local-first solution for soccer coaching worldwide**, demonstrating that privacy-focused, offline-capable applications can deliver superior performance and user experience while maintaining complete data ownership.

---

**MatchOps-Local: Empowering coaches while protecting young athletes' privacy through local-first technology.**

*Built with ❤️ for soccer coaches who value privacy, performance, and data ownership.*
