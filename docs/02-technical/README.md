# Technical Architecture

This directory contains technical architecture documentation covering system design, technology choices, and security.

## Documents

- **[architecture.md](./architecture.md)** - System design and technical architecture overview
- **[technology-decisions.md](./technology-decisions.md)** - Why we chose specific technologies and frameworks
- **[security.md](./security.md)** - Security architecture, current state, and planned improvements
- **[data-freshness-and-modal-data-flow.md](./data-freshness-and-modal-data-flow.md)** - Modal data flow patterns
- **[excel-export-library.md](./excel-export-library.md)** - Excel export implementation (xlsx)
- **[supabase-implementation-guide.md](./supabase-implementation-guide.md)** - Supabase cloud backend transform rules and implementation reference

## Subdirectories

- **[database/](./database/)** - Storage schema and database design
- **[architecture/](./architecture/)** - Detailed architecture components:
  - [dual-backend-architecture.md](./architecture/dual-backend-architecture.md) - Local vs Cloud mode design
  - [auth-data-sync-architecture.md](./architecture/auth-data-sync-architecture.md) - **Runtime behavior** of auth, data, and sync systems
  - [ADR-002-react-query-cache-strategy.md](./architecture/ADR-002-react-query-cache-strategy.md) - React Query cache strategy
  - DataStore / AuthService interfaces: the code is the specification (`src/interfaces/DataStore.ts`, `src/interfaces/AuthService.ts`); the old spec docs are in `08-archived/completed-active-plans/backend-evolution/`

## Quick Start

**Want to understand the system?** Start with [architecture.md](./architecture.md) for the complete technical overview.

**Curious about our tech stack?** Read [technology-decisions.md](./technology-decisions.md) to understand our choices.

**Security concerns?** Check [security.md](./security.md) for our security posture and roadmap.
