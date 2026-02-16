# ADR-003: Data Aggregation Handled by External Tooling

**Status:** Accepted
**Date:** 2025-12-02
**Deciders:** Product Owner
**Technical Story:** Multi-coach data aggregation requirements analysis

## Context

As MatchOps-Local grows, coaches need to combine data from multiple coaches after tournaments for team-wide statistics and analysis. Example scenarios:

- After a tournament, aggregate statistics from all coaches who tracked different games
- Combine season data from head coach and assistant coaches
- Generate team-wide performance reports spanning multiple game observers

### The Identity Matching Problem

When multiple coaches export data independently, entity reconciliation becomes challenging:

| Coach A exports | Coach B exports | Same entity? |
|-----------------|-----------------|--------------|
| "Matti Virtanen" | "Virtanen Matti" | ? |
| "FC Honka U12" | "Honka" | ? |
| "Spring Cup 2025" | "Kevät Cup" | ? |

Typos, naming conventions, abbreviations, and language differences make automatic matching unreliable.

### Why Pre-Coordination Fails

**Considered:** Have coaches agree on naming conventions before tournaments.

**Rejected because:**
- Volunteer coaches won't maintain shared naming standards consistently
- One coach creating a "template" for others to import adds work nobody wants to do
- Even with best intentions, naming drift occurs over time
- Coordination overhead increases with number of coaches

### Why Cloud Backend Doesn't Solve This

> **Editor's note (Feb 2026):** The project now has an optional Supabase cloud backend for single-user cross-device sync (PRs 1-12 merged). However, this is per-user sync, not multi-user collaboration. The analysis below about multi-coach aggregation remains valid -- the cloud backend does not change this ADR's core decision.

A cloud backend would shift the data entry burden but not eliminate it:
- Someone still needs to define canonical entity names
- Someone still needs to resolve conflicts when coaches disagree
- Synchronization adds complexity without solving the core problem
- Shared data requires ongoing maintenance

## Decision

**Data aggregation is OUT OF SCOPE for MatchOps-Local.**

Multi-coach data analysis will be handled by a **separate external analyzer tool** where:

1. Coaches use MatchOps-Local normally with zero extra burden
2. Coaches export their data via existing JSON/Excel export functionality
3. A dedicated analyst imports multiple exports into the analyzer tool
4. The analyst performs entity reconciliation (fuzzy matching + manual confirmation)
5. The analyzer generates combined statistics and reports

## Rationale

### 1. Separation of Concerns

MatchOps-Local is a **data capture tool** for individual coaches. It excels at:
- Real-time game tracking
- Player management
- Individual coach workflows
- Offline-first reliability

Data aggregation is a **different concern** requiring:
- Multi-source data import
- Entity reconciliation algorithms
- Manual conflict resolution UI
- Combined reporting/analytics

Mixing these concerns would complicate both use cases.

### 2. No Added Burden on Coaches

Volunteer coaches should focus on coaching, not data standardization:
- Current workflow: Track game → Save → Done
- Proposed workflow: Track game → Save → Done (unchanged)

The aggregation burden falls on the analyst role (often the head coach or team manager who wants the combined view).

### 3. Analyst Has Context

The person doing aggregation typically:
- Knows which "Matti" and "M. Virtanen" are the same player
- Understands team naming conventions in their league
- Can make judgment calls on ambiguous matches
- Has motivation to do it right (they want the analysis)

### 4. Technical Simplicity

MatchOps-Local remains:
- Purely local-first (no sync complexity)
- Single-user focused (no multi-user state management)
- Offline-capable (no network dependencies)

## Alternatives Considered

### Alternative 1: Built-in Import/Merge Feature

**Pros:**
- Single tool for everything
- Potentially smoother UX

**Cons:**
- Adds significant complexity to MatchOps-Local
- Merge conflict resolution UI is complex to build well
- Dilutes the app's focus on real-time coaching

**Decision:** Rejected - Scope creep, better as separate tool

### Alternative 2: Shared Cloud Database

> **Editor's note (Feb 2026):** The Supabase cloud backend added since this ADR is single-user sync (one coach's data across devices), not a shared multi-user database. The rejection below refers to a shared collaborative database for multiple coaches, which remains out of scope.

**Pros:**
- Real-time collaboration
- Single source of truth

**Cons:**
- Abandons local-first philosophy
- Server costs and maintenance
- Still requires entity standardization
- Network dependency for core features

**Decision:** Rejected - Contradicts core architecture principles

### Alternative 3: Pre-Tournament Template Sharing

**Pros:**
- Ensures consistent naming from the start

**Cons:**
- Requires coordination volunteers won't do
- One person's extra work for everyone's benefit (won't happen)
- Doesn't handle mid-season additions

**Decision:** Rejected - Volunteer reality check

### Alternative 4: External Analyzer Tool (SELECTED)

**Pros:**
- Zero impact on coach workflow
- Separation of concerns
- Analyst can use domain knowledge for reconciliation
- Can evolve independently of MatchOps-Local

**Cons:**
- Requires separate tool development
- Two tools instead of one

**Decision:** Accepted - Pragmatic solution that respects volunteer constraints

## Consequences

### Positive

1. **MatchOps-Local stays focused**
   - No feature creep from aggregation requirements
   - Simpler codebase, easier maintenance

2. **Coach workflow unchanged**
   - No new steps or requirements
   - Export functionality already exists

3. **Analyst has appropriate tools**
   - Purpose-built for reconciliation
   - Can include fuzzy matching, manual overrides, etc.

4. **Independent evolution**
   - Analyzer tool can improve without affecting MatchOps-Local
   - Different release cycles, different priorities

### Negative

1. **Two tools needed**
   - Coaches who want aggregation need both tools
   - Documentation must explain the separation

2. **Analyzer tool must be built**
   - Separate development effort
   - Not covered by MatchOps-Local roadmap

## Future Considerations

### Palloliitto TASO API Integration

If/when the Finnish Football Association's TASO system provides an API:
- Could serve as authoritative source for player/team identities
- Would reduce (not eliminate) reconciliation burden
- Integration would be in MatchOps-Local (import canonical data)
- Analyzer would still handle exports from multiple coaches

### Export Format Improvements

MatchOps-Local can improve exports to aid aggregation:
- Include unique identifiers where possible
- Standardize date/time formats
- Document export schema for analyzer tool developers

### Analyzer Tool Characteristics (Future Project)

When building the external analyzer:
- Accept multiple MatchOps-Local JSON exports
- Fuzzy matching for player/team names
- Manual reconciliation UI for ambiguous matches
- Combined statistics and visualizations
- Export combined reports

## References

### Codebase References
- Export functionality: `src/utils/savedGames.ts`
- Excel export: `src/utils/exportExcel.ts`
- Export UI: `src/components/GameStatsModal.tsx` (export buttons within stats modal)

### Related Documentation
- [Local-First Philosophy](../../01-project/local-first-philosophy.md)
- [Project Overview](../../01-project/overview.md)

---

**Last Updated:** 2025-12-02
**Status:** Active - Core architectural boundary for MatchOps-Local scope
