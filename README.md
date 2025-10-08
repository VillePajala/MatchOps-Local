# MatchOps-Local

**A local-first soccer coaching PWA that puts coaches in control of their data**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5a0fc8.svg)](https://web.dev/progressive-web-apps/)

<!-- Testing PWA update detection - Test after fresh reinstall -->

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
- **Historical Analysis**: Game-by-game performance with trend visualization
- **Aggregate Reporting**: Season, tournament, and all-time statistics
- **Data Export**: Professional reports in JSON and CSV formats

### 👥 **Team Management**
- **Master Roster System**: Central player database with complete player profiles
- **Multi-Team Support**: Manage unlimited teams with independent rosters and settings
- **Season & Tournament Organization**: Create and track competitions across all teams
- **Player Assessment**: Performance rating system with weighted difficulty tracking

### 🛡️ **Data & Privacy**
- **IndexedDB Storage**: High-performance browser storage with automatic migration
- **Complete Backup & Restore**: One-click export and import with data integrity verification
- **Privacy by Design**: Zero external data transmission (except opt-in error reporting)
- **GDPR Compliant**: No personal data collection or processing
- **Data Ownership**: Full control over your data with comprehensive export capabilities

## 🏗️ Technology Stack

- **Frontend**: Next.js 15 with React 19 and TypeScript
- **Data Storage**: Dual-layer storage system with localStorage → IndexedDB migration
- **State Management**: React Query for server state, useReducer for game logic
- **Styling**: Tailwind CSS 4 for responsive, professional design
- **PWA**: Full Progressive Web App with offline capability and installation
- **Error Monitoring**: Sentry integration for production error tracking
- **Testing**: 500+ tests with Jest and Playwright (unit, integration, accessibility)
- **Internationalization**: i18next with English and Finnish support

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
- **500+ Test Suite**: Unit, integration, accessibility, and performance tests
- **CI/CD Pipeline**: Automated linting, type-checking, testing, and security scanning
- **Memory Leak Detection**: Advanced memory management with pressure monitoring
- **Build Optimization**: Production-ready builds with source map generation

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
- **[Project Overview](docs/PROJECT_OVERVIEW.md)** - What MatchOps-Local is and why it exists
- **[Local-First Philosophy](docs/LOCAL_FIRST_PHILOSOPHY.md)** - Why local-first matters for coaching software

### **Understanding the Project**
- **[Architecture Overview](docs/ARCHITECTURE.md)** - Technical design and system architecture
- **[Competitive Analysis](docs/COMPETITIVE_ANALYSIS.md)** - How we compare to other coaching software
- **[Current Status](docs/PROJECT_STATUS.md)** - Implementation status and maturity level

### **For Developers**
- **[Contributing Guide](docs/development/CONTRIBUTING.md)** - How to contribute to the project
- **[Development Guides](docs/development/)** - Code reviews, bug reports, and development processes
- **[Testing Strategy](docs/testing/)** - Comprehensive testing approach

### **Complete Documentation**
Browse all documentation in the [docs/](docs/) directory with primary project documentation at the root level:
- **[Core Documentation](docs/)** - Project vision, philosophy, and strategic direction
- **[Development](docs/development/)** - Contribution guides and development processes
- **[Features](docs/features/)** - Detailed feature specifications and implementation plans
- **[Testing](docs/testing/)** - Testing strategies and quality assurance

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