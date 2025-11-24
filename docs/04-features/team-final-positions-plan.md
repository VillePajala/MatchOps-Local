# Team Final Position Tracking Implementation Plan

**Status**: Approved
**Owner**: TBD
**Target Date**: TBD
**Estimated Time**: 6-8 hours

## Overview

Add ability to manually record team final positions in seasons and tournaments with backward compatibility, import/export support, and real-time updates.

## Git Workflow

1. Create feature branch: `feat/team-final-positions`
2. Implement changes (Phases 1-9)
3. Verify all CI checks pass (build, lint, tests)
4. Create PR to `master`

## Implementation Phases

### Phase 0: Branch Setup

**Tasks**:
- Create and checkout `feat/team-final-positions` branch

**Acceptance**:
- Branch created from latest `master`
- Clean working directory

---

### Phase 1: Data Model

**File**: `src/types/index.ts`

**Tasks**:
- Add `CompetitionResult` interface:
  ```typescript
  export interface CompetitionResult {
    teamId: string;           // Reference to Team.id
    position: number;         // 1, 2, 3, etc. (1-indexed)
    notes?: string;           // e.g., "Champion", "Runners-up"
  }
  ```
- Add optional `teamResults?: CompetitionResult[]` to `Season` interface
- Add optional `teamResults?: CompetitionResult[]` to `Tournament` interface

**Backward Compatibility**:
- Optional field ensures existing data continues to work
- No migration needed - field simply doesn't exist on old records

**Acceptance**:
- TypeScript compilation passes
- Interfaces exported correctly

---

### Phase 2: Validation Logic

**File**: `src/utils/validation.ts`

**Tasks**:
- Create `validateCompetitionResult()` function
- Validate team ID is required and non-empty
- Validate position is positive integer (>= 1)
- Prevent duplicate teams per competition
- Prevent duplicate positions per competition
- Validate notes length <= 200 characters
- Return `ValidationResult` with errors array

**Implementation**:
```typescript
export const validateCompetitionResult = (
  result: Partial<CompetitionResult>,
  existingResults: CompetitionResult[] = []
): ValidationResult => {
  const errors: ValidationError[] = [];

  // Team ID validation
  if (!result.teamId || result.teamId.trim().length === 0) {
    errors.push({ field: 'teamId', message: 'Team is required' });
  }

  // Position validation
  if (!Number.isInteger(result.position) || result.position < 1) {
    errors.push({ field: 'position', message: 'Position must be a positive integer (1, 2, 3, ...)' });
  }

  // Check for duplicate team
  const duplicateTeam = existingResults.find(r => r.teamId === result.teamId);
  if (duplicateTeam) {
    errors.push({ field: 'teamId', message: 'This team already has a result in this competition' });
  }

  // Check for duplicate position
  const duplicatePosition = existingResults.find(r => r.position === result.position);
  if (duplicatePosition) {
    errors.push({ field: 'position', message: `Position ${result.position} is already assigned to another team` });
  }

  // Notes length validation
  if (result.notes && result.notes.length > 200) {
    errors.push({ field: 'notes', message: 'Notes must be 200 characters or less' });
  }

  return { isValid: errors.length === 0, errors };
};
```

**Acceptance**:
- All validation rules enforced
- Returns proper `ValidationResult` structure

---

### Phase 3: Storage & Compatibility Verification

**Files**: `src/utils/seasons.ts`, `src/utils/tournaments.ts`, `src/utils/seasonTournamentExport.ts`

**Tasks**:

1. **Old Data Compatibility**:
   - Verify existing CRUD operations handle optional `teamResults` field
   - Test loading old seasons/tournaments without `teamResults` field
   - Confirm spread operators automatically include new field: `{ ...season, name: updatedName }`

2. **Import/Export Functionality**:
   - Review `seasonTournamentExport.ts` to ensure `teamResults` is included in export
   - Test backward compatibility:
     - Old exports (without `teamResults`) → import works correctly
     - New exports (with `teamResults`) → results preserved on import
   - Update export format documentation if needed

3. **Verify Storage Operations**:
   - `saveSeasons()` - automatically handles new field
   - `saveTournaments()` - automatically handles new field
   - `updateSeason()` - spread operator includes new field
   - `updateTournament()` - spread operator includes new field

**Acceptance**:
- Old seasons/tournaments load without errors
- New field doesn't break existing functionality
- Import/export handles both old and new formats
- All storage operations work with optional field

---

### Phase 4: Management UI

**File**: `src/components/SeasonTournamentManagementModal.tsx`

**Tasks**:

1. **State Management**:
   - Add state for team results when editing season/tournament
   - Add state for result form (teamId, position, notes)
   - Add state for editing mode (add vs edit result)

2. **CRUD Functions**:
   - `handleAddResult()` - validate and add new result
   - `handleEditResult()` - update existing result
   - `handleDeleteResult()` - remove result
   - Integrate validation from Phase 2

3. **UI Components**:
   - Add "Team Results" section when editing season/tournament
   - Team dropdown (from teams list)
   - Position input (number, min=1)
   - Notes textarea (maxLength=200, optional)
   - Add/Save/Cancel buttons
   - Delete button for each result
   - Trophy icons for top 3 positions: 🥇 (1st), 🥈 (2nd), 🥉 (3rd)
   - Real-time validation feedback (error messages)

4. **React Query Integration**:
   - Use existing `updateSeasonMutation` and `updateTournamentMutation`
   - Include `teamResults` in mutation payload
   - **React Query invalidation** automatically triggers re-render:
     - `queryClient.invalidateQueries({ queryKey: queryKeys.seasons })` (existing)
     - `queryClient.invalidateQueries({ queryKey: queryKeys.tournaments })` (existing)
   - All components using these queries re-render with new data immediately

**Acceptance**:
- Add/edit/delete team results functional
- Real-time validation shows errors
- Trophy icons display for top 3
- React Query invalidation updates UI immediately
- No page refresh needed

---

### Phase 5: Display Integration

**Files**: `src/components/PlayerStatsView.tsx`, `src/components/GameStatsModal.tsx`, `src/components/GameSettingsModal.tsx`

**Tasks**:

1. **PlayerStatsView.tsx**:
   - Show team result badge in season/tournament performance sections
   - Display position with trophy icon if applicable
   - Format: "🥇 1st Place - Champion" or "4th Place"

2. **GameStatsModal.tsx**:
   - If game is tied to season/tournament, show team result
   - Display alongside other game metadata

3. **GameSettingsModal.tsx**:
   - Show team result in season/tournament dropdown labels
   - Format: "Spring 2024 (🥇 Champions)" or "Summer Cup (3rd Place)"

**Implementation Pattern**:
```typescript
// Get team result for current team in competition
const teamResult = season?.teamResults?.find(r => r.teamId === currentTeamId);
const trophyIcon = teamResult?.position === 1 ? '🥇' :
                   teamResult?.position === 2 ? '🥈' :
                   teamResult?.position === 3 ? '🥉' : '';
const positionLabel = teamResult?.position === 1 ? '1st Place' :
                      teamResult?.position === 2 ? '2nd Place' :
                      teamResult?.position === 3 ? '3rd Place' :
                      `${teamResult?.position}th Place`;
```

**Acceptance**:
- Team results displayed in all relevant locations
- Trophy icons show for top 3
- Graceful handling when no result exists
- Real-time updates via React Query

---

### Phase 6: Internationalization (i18n)

**Files**: `src/locales/en/translation.json`, `src/locales/fi/translation.json`

**Tasks**:

Add translations for:
- "Team Results"
- "Position"
- "Add Result"
- "Edit Result"
- "Delete Result"
- "Notes"
- Position labels: "1st Place", "2nd Place", "3rd Place", "{{position}}th Place"
- Validation errors:
  - "Team is required"
  - "Position must be a positive integer"
  - "This team already has a result in this competition"
  - "Position {{position}} is already assigned to another team"
  - "Notes must be 200 characters or less"

**Example**:
```json
{
  "competitionResults": {
    "title": "Team Results",
    "position": "Position",
    "addResult": "Add Result",
    "editResult": "Edit Result",
    "deleteResult": "Delete Result",
    "notes": "Notes",
    "positionLabel_1": "1st Place",
    "positionLabel_2": "2nd Place",
    "positionLabel_3": "3rd Place",
    "positionLabel_other": "{{position}}th Place",
    "validation": {
      "teamRequired": "Team is required",
      "positionInvalid": "Position must be a positive integer",
      "duplicateTeam": "This team already has a result in this competition",
      "duplicatePosition": "Position {{position}} is already assigned to another team",
      "notesTooLong": "Notes must be 200 characters or less"
    }
  }
}
```

**Acceptance**:
- All strings translated (EN/FI)
- Translations used consistently in UI
- No hardcoded strings

---

### Phase 7: Testing

**Tasks**:

1. **Unit Tests** (`src/utils/validation.test.ts`):
   - `validateCompetitionResult()` - all validation rules
   - Team ID required
   - Position validation (must be >= 1)
   - Duplicate team prevention
   - Duplicate position prevention
   - Notes length validation

2. **Unit Tests** (`src/utils/seasons.test.ts`, `src/utils/tournaments.test.ts`):
   - Backward compatibility - load old data without `teamResults`
   - Save/update with `teamResults` field

3. **Unit Tests** (`src/utils/seasonTournamentExport.test.ts`):
   - Export includes `teamResults`
   - Import old format (without `teamResults`) works
   - Import new format (with `teamResults`) preserves results

4. **Component Tests** (`src/components/SeasonTournamentManagementModal.test.tsx`):
   - Add team result
   - Edit team result
   - Delete team result
   - Real-time validation feedback
   - Trophy icon display for top 3
   - Duplicate team prevention
   - Duplicate position prevention

5. **Component Tests** (`src/components/PlayerStatsView.test.tsx`):
   - Team result badge display
   - Trophy icon for top 3
   - Graceful handling when no result

**Test Count**: ~16 tests total
- 6 validation unit tests
- 3 storage unit tests
- 3 import/export unit tests
- 4 component tests

**Acceptance**:
- All tests pass
- Coverage maintained (>85%)
- No flaky tests

---

### Phase 8: Manual Testing

**Test Scenarios**:

1. **Create New Season with Result**:
   - Create new season
   - Add team result (position 1)
   - Verify display in PlayerStatsView
   - Verify trophy icon shows

2. **Edit Existing Tournament**:
   - Edit existing tournament
   - Add team result
   - Verify real-time update (no page refresh)
   - Verify display in GameStatsModal

3. **Backward Compatibility**:
   - Load app with existing data
   - Verify old seasons/tournaments work
   - Verify no errors in console

4. **Import/Export**:
   - Export season with team results
   - Import in new browser/incognito
   - Verify results preserved
   - Export old season (without results)
   - Verify import works

5. **Validation**:
   - Try duplicate team - verify error
   - Try duplicate position - verify error
   - Try invalid position (0, -1) - verify error
   - Try notes >200 chars - verify error

6. **React Query Real-Time Updates**:
   - Open two tabs
   - Add result in tab 1
   - Verify tab 2 updates (if focus changes)
   - Edit result - verify immediate UI update

**Acceptance**:
- All scenarios pass
- No console errors
- UI responsive and intuitive
- Real-time updates work

---

### Phase 9: Documentation

**Files**: `docs/04-features/seasons-tournaments.md`

**Tasks**:
- Document `CompetitionResult` interface
- Document team results UI workflow
- Document backward compatibility approach
- Document import/export behavior
- Add screenshots if applicable

**Example Section**:
```markdown
## Team Final Positions

### Overview
Record team final positions in seasons and tournaments (e.g., 1st place, 2nd place, etc.).

### Data Model
- `CompetitionResult`: teamId, position, notes
- Stored in `Season.teamResults` and `Tournament.teamResults` (optional)

### UI Workflow
1. Edit season/tournament in SeasonTournamentManagementModal
2. Navigate to "Team Results" section
3. Select team, enter position, add optional notes
4. Trophy icons (🥇🥈🥉) display for top 3

### Backward Compatibility
- Optional field - old data continues to work
- Import/export handles both old and new formats

### Validation
- No duplicate teams per competition
- No duplicate positions per competition
- Position must be positive integer (1, 2, 3, ...)
```

**Acceptance**:
- Documentation complete and accurate
- Clear for future developers

---

### Phase 10: PR & CI

**Tasks**:

1. **Pre-PR Checks**:
   - `npm run build` - must pass
   - `npm run lint` - must pass
   - `npm test` - all tests pass
   - Manual testing complete
   - No TypeScript errors
   - No ESLint warnings

2. **Create PR**:
   - Branch: `feat/team-final-positions` → `master`
   - Title: "feat: add team final position tracking for seasons/tournaments"
   - Description includes:
     - Feature overview
     - Key changes
     - Testing summary
     - Backward compatibility notes
     - Screenshots

3. **CI Verification**:
   - Vercel build passes
   - All tests pass on CI
   - No regressions

4. **Post-Merge**:
   - Delete feature branch
   - Update master-execution-guide.md checklist
   - Close related issues

**Acceptance**:
- PR approved and merged
- CI green
- Feature deployed

---

## Key Requirements Addressed

✅ **Manual entry only** - User enters their team's position, not opponent teams
✅ **Detailed stats deferred** - Phase 2 can add W/L/D, GF/GA (app already calculates from games)
✅ **Team name uniqueness** - Already enforced by existing validation
✅ **No retroactive entry** - For new competitions only
✅ **Complete git workflow** - Branch → implementation → CI → PR
✅ **Old data compatibility** - Optional field, backward compatible
✅ **Import/export functionality** - Considered and tested
✅ **Real-time updates** - React Query invalidation triggers immediate re-render

---

## React Query Integration Details

### Automatic Real-Time Updates

**How It Works**:
1. User edits season/tournament and adds team result
2. `updateSeasonMutation` or `updateTournamentMutation` called with new `teamResults` field
3. Mutation success triggers React Query invalidation:
   ```typescript
   queryClient.invalidateQueries({ queryKey: queryKeys.seasons })
   queryClient.invalidateQueries({ queryKey: queryKeys.tournaments })
   ```
4. All components using these queries automatically re-fetch and re-render
5. UI updates immediately without page refresh

**Components That Auto-Update**:
- `SeasonTournamentManagementModal` - Shows updated results immediately
- `PlayerStatsView` - Shows trophy badges without refresh
- `GameStatsModal` - Shows team result for current game
- `GameSettingsModal` - Shows updated competition labels

**Existing Infrastructure**:
- React Query already configured in `src/app/page.tsx`
- Query keys defined in `src/config/queryKeys.ts`
- Mutations already handle invalidation
- No new infrastructure needed

---

## Estimated Timeline

| Phase | Tasks | Time Estimate |
|-------|-------|---------------|
| 0 | Branch setup | 5 min |
| 1 | Data model | 15 min |
| 2 | Validation logic | 30 min |
| 3 | Storage verification | 45 min |
| 4 | Management UI | 2 hours |
| 5 | Display integration | 1 hour |
| 6 | Translations | 30 min |
| 7 | Testing | 2 hours |
| 8 | Manual testing | 45 min |
| 9 | Documentation | 30 min |
| 10 | PR & CI | 30 min |
| **Total** | | **6-8 hours** |

---

## Dependencies

- Existing team management system
- Existing season/tournament CRUD operations
- React Query infrastructure
- i18n system
- Validation utilities

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking old data | High | Optional field, comprehensive testing |
| Import/export issues | Medium | Test both old and new formats |
| Validation edge cases | Low | Comprehensive unit tests |
| UI complexity | Low | Keep UI simple, follow existing patterns |

---

## Future Enhancements (Phase 2)

- Detailed stats (W/L/D, GF/GA) calculated from games
- Bulk position assignment
- Team performance comparison charts
- Export team results to PDF/CSV
