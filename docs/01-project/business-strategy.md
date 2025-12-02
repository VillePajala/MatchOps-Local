# Business Strategy Overview

## Purpose
MatchOps Local is designed as a local-first soccer coaching application with potential for future monetization.

## Current Focus
- **Primary Goal**: Provide excellent local-first experience
- **Target Users**: Soccer coaches and team managers
- **Key Features**: Player management, game tracking, statistics, offline functionality

## Business Documentation
For detailed business strategy and monetization planning, see:
- **[Monetization Strategies](../07-business/monetization-strategies.md)** - Canonical monetization strategy and options

## Core Principles
1. **Local-First**: All data stays on user's device
2. **Privacy-Focused**: No data collection or tracking
3. **Transparent Development**: Public roadmap and documentation
4. **User-Centric**: Features driven by actual coaching needs

## Product Family Vision

MatchOps is envisioned as a family of local-first soccer coaching tools, each focused on a specific workflow:

| Product | Purpose | Status |
|---------|---------|--------|
| **MatchOps-Local** | Real-time game tracking, player management, match statistics | Active development |
| **MatchOps Practice** (working title) | Soccer practice/training session design and planning | Idea stage |
| **MatchOps Analyzer** (working title) | Multi-coach data aggregation and team-wide statistics | Concept (see [ADR-003](../05-development/architecture-decisions/ADR-003-data-aggregation-external-tooling.md)) |

### Shared Philosophy

All products in the family share core principles:
- **Local-first**: Data stays on user's device
- **Privacy by design**: No tracking or data collection
- **Offline-capable**: Full functionality without internet
- **Coach-focused**: Built for real sideline/training ground use

### Why Separate Products

Each coaching activity has distinct workflows and UI requirements:
- **Match tracking** needs real-time speed, timer integration, live substitutions
- **Practice design** needs drill libraries, session templates, visual field diagrams
- **Data analysis** needs import/merge capabilities, reconciliation tools, reporting

Keeping these separate allows each product to excel at its specific use case without feature bloat.

## Repository Focus
This repository (MatchOps-Local) focuses on the game tracking product. Other products would be separate repositories when development begins. Business planning and strategy documents are organized in the `/docs/07-business/` directory to maintain clear separation of concerns.
