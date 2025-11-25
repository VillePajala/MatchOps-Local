# Active Plans & Current Status

⭐ **START HERE for current execution plans and project status**

**Last Updated**: November 24, 2025

---

## 🎯 Current Focus: Transition to Phase 2 (Weeks 3-4) of 8-Week Professional Architecture Plan

**Status**: Week 2 ✅ complete, Phase 1 (Shared State Context) delivered; preparing Phase 2 (Modal decoupling)

**Current**: PR 1-4 ✅ (GameStateContext + all hooks context-migrated). Next: Phase 2 PR5-6 (modal decoupling & aggregation)

**Goal**: Transform codebase to 9-10/10 professional quality for portfolio

**Alignment Note (dec 2025)**:
- Dates in `roadmap.md` (v1.0 Q4 2025, v1.5 Q2 2026) are out of sync with current work. Re-baseline after the 8-week refactor finishes.
- Default execution sequence to avoid rework:
  1) Finish 8-week refactor (Professional Architecture Roadmap)
  2) Do production readiness essentials (security headers, SW hardening, staging/E2E from `production-readiness.md`)
  3) Start backend evolution Phase F1.1 (DataStore/AuthService + LocalDataStore wrapper) per `backend-evolution/phased-implementation-roadmap.md`
- For any persistence-heavy feature, design against the DataStore abstraction before implementation.

---

## 📋 PRIMARY DOCUMENTS (Start Here)

### ⭐ Current Work
- **[PROFESSIONAL_ARCHITECTURE_ROADMAP.md](./PROFESSIONAL_ARCHITECTURE_ROADMAP.md)** - **PRIMARY ACTIVE PLAN**
  - 8-week roadmap to 9-10/10 architectural quality
  - Week-by-week breakdown with specific tasks
  - Created November 22, 2025

- **[REFACTORING_STATUS.md](./REFACTORING_STATUS.md)** - **SINGLE SOURCE OF TRUTH**
  - Current refactoring metrics and status
  - Updated with accurate line counts
  - Links to all relevant plans

### 📚 Reference Documents
- Historical references (archived):
  - `../08-archived/MICRO-REFactor-ROADMAP.md`
  - `../08-archived/POST-REFACTORING-ROADMAP.md`
  - `../08-archived/PROJECT_STATUS_SUMMARY.md`
  - `../08-archived/storage-concurrency-assessment.md`

### 🚀 Production & Publication (Still Active)
- **[production-readiness.md](./production-readiness.md)** - Canonical production readiness checklist
- **[release-checklist.md](./release-checklist.md)** - Final go/no-go checklist
- **[master-execution-guide.md](./master-execution-guide.md)** - Play Store readiness execution guide
- **[publication-roadmap.md](./publication-roadmap.md)** - Publication phases overview
- **[play-store-deployment.md](./play-store-deployment.md)** - Play Store/TWA specifics
- **[saved-games-integrity-plan.md](./saved-games-integrity-plan.md)** - Import/cache/new-game hardening plan

---

## 🗺️ Project Roadmaps

### Strategic Planning
- **[roadmap.md](./roadmap.md)** - Long-term project vision (Version 1.0 → 2.5)
- **[NPM_DEPENDENCY_UPDATE_PLAN.md](./NPM_DEPENDENCY_UPDATE_PLAN.md)** - Dependency update strategy

### Production & Launch
- **[master-execution-guide.md](./master-execution-guide.md)** - Play Store readiness guide
- **[play-store-deployment.md](./play-store-deployment.md)** - Deployment procedures
- **[publication-roadmap.md](./publication-roadmap.md)** - Publication strategy
- **[production-readiness.md](./production-readiness.md)** - Production checklist
- **[release-checklist.md](./release-checklist.md)** - Final go/no-go checklist

### Marketing & Social
- **[LINKEDIN_CONTENT_STRATEGY.md](./LINKEDIN_CONTENT_STRATEGY.md)** - LinkedIn content plan
- **[SOCIAL_MEDIA_LAUNCH_STRATEGY.md](./SOCIAL_MEDIA_LAUNCH_STRATEGY.md)** - Social media strategy

---

## 📋 Feature Plans & Technical Assessments

- **[personnel-comprehensive-plan-2025.md](./personnel-comprehensive-plan-2025.md)** - Personnel management feature
- **[team-final-positions-plan.md](./team-final-positions-plan.md)** - Team standings feature
- **[storage-concurrency-assessment.md](./storage-concurrency-assessment.md)** - Storage layer analysis
- **[L1-Manual-Regression-CHECKLIST.md](./L1-Manual-Regression-CHECKLIST.md)** - Manual testing checklist

---

## 📁 Subdirectories

- **[backend-evolution/](./backend-evolution/)** - Future backend architecture plans

---

## 🚀 Quick Start Guide

### If you're working on current refactoring:
1. **Read**: [PROFESSIONAL_ARCHITECTURE_ROADMAP.md](./PROFESSIONAL_ARCHITECTURE_ROADMAP.md)
2. **Check**: Current week and tasks
3. **Execute**: Follow step-by-step instructions
4. **Update**: Mark completed tasks

### If you're checking project status:
1. **Read**: [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) for technical status
2. **Read**: [roadmap.md](./roadmap.md) for long-term vision

### If you're planning next features:
1. **Review**: Feature plans in this directory
2. **Check**: [NPM_DEPENDENCY_UPDATE_PLAN.md](./NPM_DEPENDENCY_UPDATE_PLAN.md) for technical debt

### If you're preparing for production:
1. **Start**: [master-execution-guide.md](./master-execution-guide.md)
2. **Follow**: [production-readiness.md](./production-readiness.md)
3. **Final check**: [release-checklist.md](./release-checklist.md)

---

## 📚 Archived Documentation

Completed plans and superseded documents have been moved to:
- `/docs/08-archived/refactoring-2024-2025/`

This keeps the active plans directory focused on current work.

---

## 🔄 Document Maintenance

This README is maintained to reflect the current state of active plans. When plans are completed or superseded:
1. Add archive note to the document
2. Move to appropriate archive directory
3. Update this README to remove the reference

**Last Review**: November 22, 2025
