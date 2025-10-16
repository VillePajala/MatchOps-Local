# MatchOps-Local

**A local-first soccer coaching PWA that puts coaches in control of their data**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3+-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/tests-7900+-green.svg)](#)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5a0fc8.svg)](https://web.dev/progressive-web-apps/)

<!-- PWA update detection - Final verification test -->

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
- **Real-Time Event Logging**: Goals, assists, cards, and substitutions with timestamp tracking
- **Tactics Board**: Dedicated drawing interface for play design and team instruction

### 📊 **Statistics & Analytics**
- **Comprehensive Player Stats**: Goals, assists, playtime, and performance tracking
- **Club Season Filtering**: Smart filtering by club season period (e.g., Oct-May)
- **Historical Analysis**: Game-by-game performance with trend visualization
- **Aggregate Reporting**: Season, tournament, club season, and all-time statistics
- **Fair Play Trophy System**: Tournament player awards and recognition
- **Data Export**: Professional reports in JSON and CSV formats

### 👥 **Team Management**
- **Master Roster System**: Central player database with complete player profiles
- **Multi-Team Support**: Manage unlimited teams with independent rosters and settings
- **Season & Tournament Organization**: Create and track competitions across all teams
- **Player Performance Assessment**: Multi-dimensional rating system (technical, tactical, physical, mental) with weighted difficulty tracking and game context

### 🛡️ **Data & Privacy**
- **IndexedDB Storage**: High-performance browser storage with automatic migration
- **Complete Backup & Restore**: One-click full backup export and import with data integrity verification
- **Game Import/Export**: Flexible JSON-based game import for data portability
- **Privacy by Design**: Zero external data transmission (except opt-in error reporting)
- **GDPR Compliant**: No personal data collection or processing
- **Data Ownership**: Full control over your data with comprehensive export capabilities

## 🏗️ Technology Stack

- **Frontend**: Next.js 15.3+ with React 19 and TypeScript 5
- **Data Storage**: IndexedDB-first architecture with automatic legacy localStorage migration
- **State Management**: React Query for server state, useReducer for game logic
- **Styling**: Tailwind CSS 4 for responsive, professional design
- **PWA**: Full Progressive Web App with offline capability, wake lock, and auto-updates
- **Error Monitoring**: Sentry integration for production error tracking
- **Testing**: 7,900+ tests across 258 suites with Jest and Playwright (unit, integration, accessibility, performance)
- **Internationalization**: i18next with English and Finnish support
- **Analytics**: Vercel Analytics integration for usage insights

## 📊 Project Status: Production Ready

MatchOps-Local has reached **production maturity** with enterprise-grade features and comprehensive testing. The application is actively used by soccer coaches with robust data management and error monitoring.

### ✅ **Core System Features**
- **Advanced Data Migration**: Enterprise-grade IndexedDB migration with pause/resume/cancel
- **Memory Management**: Intelligent memory pressure detection and optimization
- **Error Monitoring**: Production error tracking with Sentry integration
- **Comprehensive Testing**: 500+ test cases covering edge cases and error scenarios
- **Performance Optimized**: Sub-second response times with intelligent caching

### ✅ **Production Quality**
- **Cross-Platform**: Works on all modern browsers and devices
- **Offline Capable**: Complete functionality without internet connection
- **Data Safe**: Robust backup, recovery, and migration systems
- **Privacy Focused**: Zero external data transmission (except error reporting in production)
- **Accessibility**: WCAG compliant with comprehensive a11y testing

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
- **7,900+ Test Suite**: Unit, integration, accessibility, and performance tests across 258 suites
- **CI/CD Pipeline**: Automated linting, type-checking, testing, and security scanning
- **Memory Leak Detection**: Advanced memory management with pressure monitoring
- **Build Optimization**: Production-ready builds with source map generation
- **Wake Lock Integration**: Screen stays on during active games for sideline coaching

## 🚀 Quick Start

### Option 1: Use Hosted Version
Visit our hosted instance (link coming soon) - no installation required, works immediately in your browser.

### Option 2: Self-Host
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the application: `npm run build`
4. Deploy static files to your web server

For detailed setup instructions, see [docs/deployment/](docs/deployment/).

## 📖 Documentation

### **New to MatchOps-Local?**
- **[Project Overview](docs/01-project/overview.md)** - What MatchOps-Local is and why it exists
- **[Local-First Philosophy](docs/01-project/local-first-philosophy.md)** - Why local-first matters for coaching software
- **[Competitive Analysis](docs/01-project/competitive-analysis.md)** - How we compare to other coaching software

### **Understanding the Project**
- **[Architecture Overview](docs/02-technical/architecture.md)** - Technical design and system architecture
- **[Database Schema](docs/02-technical/database/)** - Current storage structure and data models
- **[Security & Privacy](docs/02-technical/security.md)** - Privacy-first design and security measures

### **For Developers**
- **[Contributing Guide](docs/05-development/)** - How to contribute to the project
- **[Development Guides](docs/05-development/)** - Code reviews, bug reports, and development processes
- **[Testing Strategy](docs/06-testing/)** - Comprehensive testing approach

### **Feature Documentation**
- **[Features Overview](docs/04-features/)** - Detailed feature specifications and implementation
- **[Team Management](docs/04-features/team-management.md)** - Multi-team architecture
- **[Seasons & Tournaments](docs/04-features/seasons-tournaments.md)** - Competition tracking

### **Complete Documentation**
Browse all documentation in the [docs/](docs/) directory:
- **[01-Project](docs/01-project/)** - Vision, philosophy, and strategic direction
- **[02-Technical](docs/02-technical/)** - Architecture and technical decisions
- **[04-Features](docs/04-features/)** - Feature specifications and plans
- **[05-Development](docs/05-development/)** - Contribution and development guides
- **[06-Testing](docs/06-testing/)** - Testing strategies and quality assurance

## 🤝 Contributing

We welcome contributions from the community! Whether you're:
- **Coaches** providing feedback and testing
- **Developers** contributing code and features
- **Designers** improving user experience
- **Advocates** promoting local-first principles

See our [Contributing Guide](docs/development/CONTRIBUTING.md) to get started.

## 🌟 Why Local-First Matters

In an era of increasing data privacy concerns, MatchOps-Local demonstrates that powerful, modern applications can:
- **Protect user privacy** by keeping data local
- **Deliver superior performance** through local data access
- **Eliminate ongoing costs** without subscription dependencies
- **Work reliably offline** in any environment

For youth sports, where we handle sensitive information about minors, the local-first approach isn't just preferred—**it's essential**.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Project Vision

**To establish MatchOps-Local as the premier local-first solution for soccer coaching worldwide**, demonstrating that privacy-focused, offline-capable applications can deliver superior performance and user experience while maintaining complete data ownership.

---

**MatchOps-Local: Empowering coaches while protecting young athletes' privacy through local-first technology.**

*Built with ❤️ for soccer coaches who value privacy, performance, and data ownership.*