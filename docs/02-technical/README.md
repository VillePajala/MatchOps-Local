# Technical Architecture

This directory contains technical architecture documentation covering system design, technology choices, and security.

## Documents

- **[architecture.md](./architecture.md)** - System design and technical architecture overview
- **[technology-decisions.md](./technology-decisions.md)** - Why we chose specific technologies and frameworks
- **[security.md](./security.md)** - Security architecture, current state, and planned improvements
- **[data-freshness-and-modal-data-flow.md](./data-freshness-and-modal-data-flow.md)** - Modal data flow patterns
- **[excel-export-library.md](./excel-export-library.md)** - Excel export implementation (xlsx)

## Subdirectories

- **[database/](./database/)** - Storage schema and database design
- **[architecture/](./architecture/)** - Detailed architecture components:
  - [dual-backend-architecture.md](./architecture/dual-backend-architecture.md) - Local vs Cloud mode design
  - [auth-data-sync-architecture.md](./architecture/auth-data-sync-architecture.md) - **Runtime behavior** of auth, data, and sync systems
  - [datastore-interface.md](./architecture/datastore-interface.md) - DataStore interface specification
  - [auth-service-interface.md](./architecture/auth-service-interface.md) - AuthService interface specification

## Quick Start

**Want to understand the system?** Start with [architecture.md](./architecture.md) for the complete technical overview.

**Curious about our tech stack?** Read [technology-decisions.md](./technology-decisions.md) to understand our choices.

**Security concerns?** Check [security.md](./security.md) for our security posture and roadmap.
