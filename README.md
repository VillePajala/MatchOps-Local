<div align="center">
  <img src="public/logos/app-logo-yellow.png" alt="MatchOps-Local Logo" width="200"/>
</div>

# MatchOps-Local

**A local-first soccer coaching PWA that puts coaches in control of their data**

[![License](https://img.shields.io/badge/license-All_Rights_Reserved-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3+-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/tests-1060+-green.svg)](#)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5a0fc8.svg)](https://web.dev/progressive-web-apps/)
[![Code Quality](https://img.shields.io/badge/status-Critical_Fixes_Pending-red.svg)](docs/CRITICAL_FIXES_REQUIRED.md)

## What is MatchOps-Local?

MatchOps-Local is a comprehensive Progressive Web App (PWA) designed specifically for soccer coaches who want **complete control over their team data** while maintaining the convenience of modern web applications. Unlike cloud-based alternatives, MatchOps-Local stores all data locally on your device, ensuring **privacy, reliability, and instant performance**.

### 🔑 Key Differentiators

- **🔒 Complete Privacy**: All data stays on your device - no external servers, no tracking, no data collection
- **⚡ Instant Performance**: Sub-second response times with local data access
- **📴 Offline First**: Full functionality without internet connection
- **💰 Zero Ongoing Costs**: No subscriptions, no per-user fees, install once and use forever
- **⚽ Soccer-Specific**: Purpose-built for soccer coaching workflows and needs

## 🚀 Core Features

### ⚽ **Game Day Management**
- **Interactive Soccer Field**: Drag-and-drop player positioning with realistic field visualization
- **Live Game Timer**: Professional timer with large overlay display for sideline visibility
  - Configurable substitution intervals (1-20 minutes)
  - Time-since-last-substitution tracking
  - Visual alerts for upcoming substitutions (warning at 1 minute, due when time reached)
  - Substitution history log with timestamps
- **Real-Time Event Logging**:
  - Goals with scorer and assist tracking
  - Opponent goals
  - Inline opponent name editing during games
  - Event timestamps synced with game timer
- **Tactics Board**: Dedicated drawing interface for play design and team instruction
  - Add/remove opponent players and discs
  - Clear drawings without resetting field
  - Undo/Redo support for field changes
  - Toggle between tactics view and standard player view
- **Field Tools Panel**: Quick access to field management
  - Place all selected players automatically
  - Reset field to default state
  - Undo/Redo field actions
  - Clear tactical drawings

### 📊 **Statistics & Analytics**
- **Comprehensive Player Stats**:
  - Goals, assists, appearances, playtime tracking
  - Performance trends across games, seasons, and tournaments
  - Per-game statistics with sortable columns (goals, assists, time played)
  - Tournament-specific performance tracking
- **Advanced Filtering**:
  - Filter by season, tournament, or team
  - Club season filtering (e.g., Oct-May for winter season)
  - Combined filters for detailed analysis
  - Player-specific game history view
- **Tournament System**:
  - Tournament player awards (Fair Play Trophy, etc.)
  - Tournament winner tracking
  - Performance statistics per tournament
  - Season and tournament details modals for comprehensive management
- **Game Statistics Modal**:
  - Overall statistics across all games
  - Current game stats with live updates
  - Season performance summaries
  - Tournament performance summaries
  - Player-focused view with season participation count
  - Sortable tables (by goals, assists, playtime, etc.)
  - Integrated goal log with edit/delete functionality via 3-dot menu

### 👥 **Team Management**
- **Master Roster System**: Central player database shared across all teams
  - Add, edit, and remove players
  - Player stats view from roster (goals, games played, etc.)
  - Goalie designation support
  - Player name and nickname support
- **Multi-Team Support**:
  - Create and manage unlimited teams
  - Independent rosters from master player database
  - Team-specific settings and configurations
  - Team roster selection for each game
- **Season & Tournament Organization**:
  - Create seasons with date ranges (e.g., Fall 2024: Sep - Dec)
  - Create tournaments with winners and awards
  - Detailed season and tournament management modals
  - Associate games with seasons or tournaments
  - Track performance across competitions
- **Player Performance Assessment**:
  - Multi-dimensional rating system:
    - Technical skills (passing, shooting, dribbling, etc.)
    - Tactical understanding (positioning, decision-making)
    - Physical attributes (speed, stamina, strength)
    - Mental qualities (focus, attitude, teamwork)
  - Weighted difficulty tracking based on opponent strength
  - Game context captured (score, date, location, periods)
  - Historical assessment trends per player
  - Save and reset assessment functionality

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
- **Testing**: 1,060+ tests across 91 suites with Jest and React Testing Library
- **Internationalization**: i18next with English and Finnish support
- **Icons**: React Icons (Heroicons 2, Font Awesome)
- **Analytics**: Vercel Analytics integration for usage insights (production only)

## 📊 Project Status: Production Ready

MatchOps-Local has reached **production maturity** with enterprise-grade features and comprehensive testing. The application is actively used by soccer coaches with robust data management and error monitoring.

### ✅ **Core System Features**
- **Advanced Data Migration**: Enterprise-grade IndexedDB migration with pause/resume/cancel
- **Memory Management**: Intelligent memory pressure detection and optimization
- **Error Monitoring**: Production error tracking with Sentry integration (optional)
- **Comprehensive Testing**: 1,060+ tests across 91 suites covering core workflows, edge cases, and accessibility
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
- **1,060+ Test Suite**: Unit, integration, and accessibility tests across 91 suites
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

## ⚠️ Important: Critical Fixes Required

**🔴 For Developers and Contributors**

Before starting any major feature development, please be aware that we have identified **5 critical/high-priority architectural issues** that must be addressed:

| Issue | Impact | Time | Status |
|-------|--------|------|--------|
| HomePage.tsx (3,602 lines) | Blocks maintainability | 2-3h | ❌ Not Started |
| GameSettingsModal.tsx (1,707 lines) | Complex changes difficult | 1h | ❌ Not Started |
| Modal state management | Race conditions | 30m | ❌ Not Started |
| Error handling | Silent failures | 1h | ❌ Not Started |
| Performance optimization | Slow re-renders | 30m | ❌ Not Started |

**Total Investment**: 4-5 hours | **ROI**: ~1000% over 2 years (3-5x faster development)

### Essential Reading for Contributors

📋 **[CRITICAL_FIXES_REQUIRED.md](docs/CRITICAL_FIXES_REQUIRED.md)** - Complete analysis and detailed fix plans

📊 **[CRITICAL_FIXES_TRACKER.md](docs/CRITICAL_FIXES_TRACKER.md)** - Interactive progress tracker

📄 **[QUICK_FIX_REFERENCE.md](docs/05-development/QUICK_FIX_REFERENCE.md)** - One-page printable summary

🔍 **[Code Review (Oct 16, 2025)](docs/reviews/code-review-2025-10-16.md)** - Full code review findings

**Note**: These fixes are documented in detail with step-by-step implementation plans. See [CLAUDE.md](CLAUDE.md) for AI assistant guidance on these issues.

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
