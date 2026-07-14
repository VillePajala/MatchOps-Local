/**
 * Comprehensive Translation File Validation Tests
 *
 * These tests ensure translation files remain in sync and catch common issues
 * like duplicate keys, missing translations, and structural inconsistencies.
 *
 * @module i18n-validation
 */

import * as fs from 'fs';
import * as path from 'path';

// Helper to recursively get all keys from a nested object
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value as Record<string, unknown>, newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}

// Helper to get value at a dot-notation path
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// Helper to find duplicate keys in raw JSON content
function findDuplicateTopLevelKeys(content: string): { key: string; lines: number[] }[] {
  const lines = content.split('\n');
  const topLevelPattern = /^  "([^"]+)":\s*\{/;
  const keyOccurrences: Record<string, number[]> = {};

  lines.forEach((line, idx) => {
    const match = line.match(topLevelPattern);
    if (match) {
      const key = match[1];
      if (!keyOccurrences[key]) {
        keyOccurrences[key] = [];
      }
      keyOccurrences[key].push(idx + 1);
    }
  });

  return Object.entries(keyOccurrences)
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([key, occurrences]) => ({ key, lines: occurrences }));
}

// Load translation files
const localesPath = path.join(process.cwd(), 'public/locales');
const enPath = path.join(localesPath, 'en/common.json');
const fiPath = path.join(localesPath, 'fi/common.json');

describe('Translation File Validation', () => {
  let enContent: string;
  let fiContent: string;
  let en: Record<string, unknown>;
  let fi: Record<string, unknown>;
  let enKeys: string[];
  let fiKeys: string[];

  beforeAll(() => {
    enContent = fs.readFileSync(enPath, 'utf8');
    fiContent = fs.readFileSync(fiPath, 'utf8');
    en = JSON.parse(enContent);
    fi = JSON.parse(fiContent);
    enKeys = getAllKeys(en);
    fiKeys = getAllKeys(fi);
  });

  describe('JSON Structure', () => {
    it('EN file should be valid JSON', () => {
      expect(() => JSON.parse(enContent)).not.toThrow();
    });

    it('FI file should be valid JSON', () => {
      expect(() => JSON.parse(fiContent)).not.toThrow();
    });

    it('EN file should not have duplicate top-level keys', () => {
      const duplicates = findDuplicateTopLevelKeys(enContent);
      if (duplicates.length > 0) {
        const details = duplicates
          .map((d) => `${d.key} at lines ${d.lines.join(', ')}`)
          .join('; ');
        fail(`EN file has duplicate keys: ${details}`);
      }
    });

    it('FI file should not have duplicate top-level keys', () => {
      const duplicates = findDuplicateTopLevelKeys(fiContent);
      if (duplicates.length > 0) {
        const details = duplicates
          .map((d) => `${d.key} at lines ${d.lines.join(', ')}`)
          .join('; ');
        fail(`FI file has duplicate keys: ${details}`);
      }
    });
  });

  describe('Key Parity', () => {
    it('EN and FI files should have the same number of keys', () => {
      expect(enKeys.length).toBe(fiKeys.length);
    });

    it('all EN keys should exist in FI', () => {
      const fiKeySet = new Set(fiKeys);
      const missingInFi = enKeys.filter((k) => !fiKeySet.has(k));

      if (missingInFi.length > 0) {
        fail(
          `${missingInFi.length} EN keys missing from FI:\n${missingInFi.slice(0, 10).join('\n')}${missingInFi.length > 10 ? `\n... and ${missingInFi.length - 10} more` : ''}`
        );
      }
    });

    it('all FI keys should exist in EN', () => {
      const enKeySet = new Set(enKeys);
      const missingInEn = fiKeys.filter((k) => !enKeySet.has(k));

      if (missingInEn.length > 0) {
        fail(
          `${missingInEn.length} FI keys missing from EN:\n${missingInEn.slice(0, 10).join('\n')}${missingInEn.length > 10 ? `\n... and ${missingInEn.length - 10} more` : ''}`
        );
      }
    });
  });

  describe('Value Quality', () => {
    it('no empty string values in EN', () => {
      const emptyKeys = enKeys.filter((k) => getValueAtPath(en, k) === '');
      if (emptyKeys.length > 0) {
        fail(`EN has empty values for: ${emptyKeys.join(', ')}`);
      }
    });

    it('no empty string values in FI', () => {
      const emptyKeys = fiKeys.filter((k) => getValueAtPath(fi, k) === '');
      if (emptyKeys.length > 0) {
        fail(`FI has empty values for: ${emptyKeys.join(', ')}`);
      }
    });

    it('no TODO/FIXME/TRANSLATE placeholders in EN', () => {
      const placeholderPattern = /\b(TODO|FIXME|TRANSLATE|XXX)\b/i;
      const badKeys = enKeys.filter((k) => {
        const value = getValueAtPath(en, k);
        return typeof value === 'string' && placeholderPattern.test(value);
      });
      if (badKeys.length > 0) {
        fail(`EN has placeholder text in: ${badKeys.join(', ')}`);
      }
    });

    it('no TODO/FIXME/TRANSLATE placeholders in FI', () => {
      const placeholderPattern = /\b(TODO|FIXME|TRANSLATE|XXX)\b/i;
      const badKeys = fiKeys.filter((k) => {
        const value = getValueAtPath(fi, k);
        return typeof value === 'string' && placeholderPattern.test(value);
      });
      if (badKeys.length > 0) {
        fail(`FI has placeholder text in: ${badKeys.join(', ')}`);
      }
    });
  });

  describe('Interpolation Variables', () => {
    it('interpolation variables should match between EN and FI', () => {
      const variablePattern = /\{\{(\w+)\}\}/g;
      const mismatches: string[] = [];

      enKeys.forEach((key) => {
        const enValue = getValueAtPath(en, key);
        const fiValue = getValueAtPath(fi, key);

        if (typeof enValue === 'string' && typeof fiValue === 'string') {
          const enVars = new Set([...enValue.matchAll(variablePattern)].map((m) => m[1]));
          const fiVars = new Set([...fiValue.matchAll(variablePattern)].map((m) => m[1]));

          const enOnly = [...enVars].filter((v) => !fiVars.has(v));
          const fiOnly = [...fiVars].filter((v) => !enVars.has(v));

          if (enOnly.length > 0 || fiOnly.length > 0) {
            mismatches.push(
              `${key}: EN has {${[...enVars].join(',')}}, FI has {${[...fiVars].join(',')}}`
            );
          }
        }
      });

      if (mismatches.length > 0) {
        fail(
          `Interpolation variable mismatches:\n${mismatches.slice(0, 5).join('\n')}${mismatches.length > 5 ? `\n... and ${mismatches.length - 5} more` : ''}`
        );
      }
    });
  });

  describe('Pluralization', () => {
    it('pluralization keys should be complete (_one and _other pairs)', () => {
      const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other'];
      const incompletePairs: string[] = [];

      enKeys.forEach((key) => {
        pluralSuffixes.forEach((suffix) => {
          if (key.endsWith(suffix)) {
            const baseKey = key.slice(0, -suffix.length);
            // If we have _one, we should have _other (the most common pair)
            if (suffix === '_one') {
              const otherKey = `${baseKey}_other`;
              if (!enKeys.includes(otherKey)) {
                incompletePairs.push(`${key} exists but ${otherKey} is missing`);
              }
            }
          }
        });
      });

      if (incompletePairs.length > 0) {
        fail(`Incomplete pluralization pairs:\n${incompletePairs.join('\n')}`);
      }
    });
  });

  describe('Consistency Checks', () => {
    it('button labels should be consistent (Save vs Save Changes)', () => {
      // This is a sample consistency check - adjust based on your conventions
      const saveKeys = enKeys.filter((k) => k.toLowerCase().includes('save'));
      // Just ensure they exist - specific consistency rules can be added
      expect(saveKeys.length).toBeGreaterThan(0);
    });

    it('modal titles should follow naming convention', () => {
      const modalTitleKeys = enKeys.filter(
        (k) => k.includes('Modal.title') || k.includes('Modal.createTitle')
      );
      // Ensure modal title keys exist
      expect(modalTitleKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Snapshot', () => {
    it('EN key count should match expected (update snapshot if intentional)', () => {
      // Update this number when intentionally adding/removing keys
      // Billing Phases 5-6: Subscription context + warning banner + Play Billing keys
      // Desktop registration block: auth + premium + startScreen keys
      // Account-Subscription Separation Model: subscription/welcome keys
      // Security fixes: signOut, manageSubscription, switchedToLocal keys
      // Robustness fixes: playBilling restore functionality keys
      // Migration wizard trigger fix: importLocalData + subscriptionSuccess keys
      // Local-first sync UI: syncStatus + syncDetails keys (Phase 6)
      // Mode switching: pendingSync warning keys (Phase 7)
      // CloudSync error differentiation: clearNetworkError, clearAuthError, signOutNetworkError (Phase 8)
      // Sync status paused state: paused, pausedTitle (Phase 8)
      // Page toast translations: 18 keys for page.tsx and useGameOrchestration.ts toasts
      // Legacy migration keys: legacyDataMigrated, legacyMigrationFailed (Step 8)
      // Legacy migration pluralization: legacyDataMigrated_one, legacyDataMigrated_other (Step 8)
      // Cloud hydration keys: dataLoadedFromCloud, failedToLoadCloudData, partialSyncComplete, genericError (Timestamp Conflict Resolution)
      // Auth timeout UI: connectionTimeout, connectionTimeoutDesc, tryAgain, useLocalModeInstead, plus 2 additional keys
      // Reset functionality: resync + factory reset keys for cloud mode (8 settingsModal + 5 page keys)
      // Entity deletion integrity: entityType (3 keys) + deleteBlocked (8 keys)
      // Import loading overlay: restoring, restoringTitle, restoringDescription, deleteDescriptionAccount (settingsModal)
      // Migration wizard simplified: syncDescription, notNow, syncToCloud, loadDataFailed, canRetryOrCancel, dataIsSafe, errorGeneric, syncFailedUnknown (migration)
      // Common keys: done, retry
      // Sync details: resume, pause, resumeTitle, pauseTitle, pausedWarning, cloudNotConnected
      // Multi-tab prevention: alreadyOpen, alreadyOpenDesc
      // Previous: 2055 → ... → 2282 → 2323 → 2372 → 2418 → 2419 → 2420 → 2421 → 2442
      // Settings feedback: friendly email path plus copyable app info
      // Goal log source of truth: unknownScorer, scoreMismatch, recalculateScoreButton,
      // recalculateScoreTitle, recalculateScoreConfirm, recalculateConfirmButton (+6)
      // plus export.unknownScorer (+1)
      // +2: deleteAccountKeepDataHint, deleteAccountExportButton (delete-account export affordance)
      // +13: settingsModal.restorePoints.* (Data Safety Layer 1 restore-point UI)
      // +3: backupReminder.* (Data Safety Layer 2 off-device backup reminder banner)
      // +1: fullBackup.exportDownloaded (clear "saved to Downloads" message on download fallback)
      // +1: assessmentMetrics set A (6 new ids added, 5 legacy removed = net +1)
      // +5: assessmentScale.level1..5 (5-level developmental word scale)
      // +6: settingsModal assessment rating-style toggle (label, hint, 3 options, save error)
      // +8: development view - recency toggle (2), focus/strengths (2), assessmentTrend.* (4)
      // +2: development radar legend (radarNow, radarBaseline)
      // +2: planner UI rounds - playtimePlanner.lineup.autoFill, playtimePlanner.balance.gameShort
      //     (part of the count baseline above; listed for completeness - PR #650 review nit)
      // +10: gameSettingsModal.reapplyPlan.* (Planner Phase 3.3 re-apply-plan button/confirm/toasts)
      // +5: playtimePlanner.overview.* bulk re-apply (Planner Phase 3.4 update-linked-games)
      // +1: playtimePlanner.overview.reapplyDonePartial (bulk partial-failure toast, PR #650 review)
      // +13: Batch C - _one/_other plural pairs for 7 planner/reapply count strings (+7),
      //      ConfirmationModal titles/labels/warning for plan delete + bulk re-apply (+4),
      //      playtimePlanner.gkShort (+1), playtimePlanner.subs.rowInOut (+1)
      // +1: playtimePlanner.lineup.gameTabs (game tab strip aria-label - 1-tap game switching)
      // +10: plan roster editing (overview.editPlayers + playtimePlanner.players.* - Phase 4)
      // +1: playtimePlanner.lineup.fairnessStrip (worst-first totals strip in the lineup view)
      // +1 net: sub bottom sheet (+5: lineup.subAction, lineup.notInGame, subs.addHint,
      //         subSheet.title, subSheet.halftime; -4: the old dropdown form's
      //         subs.slotLabel/choose/add/noSlots)
      // +7 net: minutes-view redesign (+8: balance zeroMinutes pair, spreadLabel/Detail,
      //         gkLabel/Detail, focusDelta, focusOnShare; -1: notPlaying, absorbed by
      //         the zero-minutes warning)
      // +6: playtimePlanner.overview.suggest* (fair-lineup generator button/confirm/toast)
      // +1: playtimePlanner.overview.gridButton (all-games-side-by-side view)
      // +3 net: plan-manager flow (+4: manager.title/new/meta, lineup.gameName;
      //         -1: versions.switchLabel, dropdown replaced by the manager)
      // -1: playtimePlanner.setup.teamHint (explanatory text under team select removed)
      // +1 net: overview composition rework (+3: overview.notCounted,
      //         lineup.includedToggle/excludedToggle - include dot on game tabs;
      //         -2: overview.included checkbox, overview.rosterSummary - replaced
      //         by roster checkboxes and tab dots)
      // +5: manager 3-dot menu + archive (manager.actions/archive/unarchive/
      //     archivedBadge/showArchived)
      // +4: overview format editor (overview.addGame/removeGame/
      //     trimConfirmTitle/trimConfirmMessage - post-creation plan editing)
      // +1 then -1: lineup.renameGame (pencil rename, superseded same day by
      //     the tap-editable game name in the header)
      // +2 net: tabs restructure (+7: tabs.games/minutes/plan,
      //     lineup.viewToggle/viewSingle/viewGrid, players.replaceTitle;
      //     -5: balance.view, overview.gridButton/editPlayers,
      //     players.title/addHeading - hub buttons replaced by peer tabs)
      // -3 net: field polish (+1 subSheet.existing - in-sheet sub removal;
      //     -4: lineup.hint/pickForSlot/viewToggle, subs.addHint -
      //     instruction copy removed, toggle became one icon button)
      // +2: lineup.noPlayers (zero-player empty state) + loadError (initial
      //     load-failure toast) - review batch B
      // +1: lineup.absentHeading (per-game availability chips)
      // -1 net: review round (+1 lineup.benchEmptyAbsent; -2 dead keys
      //     lineup.benchHeading, overview.newPlan)
      // +2: balance.sitsOut_one/_other (zero-minutes warning split: red = no
      //     minutes ANYWHERE, amber = sits out a full game but plays elsewhere)
      // -3/+2 net -1: menu groups regrouped by scope (two-level restructure
      //     PR 0.1): gameManagement/setupConfig/analysisTools -> thisMatch/teamAndApp
      // +1: controlBar.teamStats (PR 0.2: stats menu entry split match vs team)
      // +5: startScreen.homeTabs/tabGames/tabTeam/tabSeasons/tabStats (PR 1.2:
      //     the Home shell's club-level tab bar)
      // +2: startScreen.resumeCard/savedGames (PR 1.3: the Pelit front page)
      // -3: startScreen.continue/loadGame/viewStats orphaned by the front-page
      //     rebuild (old Continue / Load Game / Statistics buttons removed)
      // +3: startScreen.rowPlayers/rowTeams/rowPersonnel (1.3b: Team tab panel)
      // +5: startScreen.rowTraining + gearTitle/gearBackup/gearAccount/gearRules
      //     (PR 1.4: the gear bucket)
      expect(enKeys.length).toBe(2822);
    });

    it('FI key count should match expected (update snapshot if intentional)', () => {
      // Update this number when intentionally adding/removing keys
      // Previous: 2055 → ... → 2282 → 2323 → 2372 → 2418 → 2419 → 2420 → 2421 → 2442
      // Settings feedback: friendly email path plus copyable app info
      // Goal log source of truth (+6, see EN above)
      // +2: deleteAccountKeepDataHint, deleteAccountExportButton (delete-account export affordance)
      // +13: settingsModal.restorePoints.* (Data Safety Layer 1 restore-point UI)
      // +3: backupReminder.* (Data Safety Layer 2 off-device backup reminder banner)
      // +1: fullBackup.exportDownloaded (clear "saved to Downloads" message on download fallback)
      // +1: assessmentMetrics set A (6 new ids added, 5 legacy removed = net +1)
      // +5: assessmentScale.level1..5 (5-level developmental word scale)
      // +6: settingsModal assessment rating-style toggle (label, hint, 3 options, save error)
      // +8: development view - recency toggle (2), focus/strengths (2), assessmentTrend.* (4)
      // +2: development radar legend (radarNow, radarBaseline)
      // +2: planner UI rounds - playtimePlanner.lineup.autoFill, playtimePlanner.balance.gameShort
      //     (part of the count baseline above; listed for completeness - PR #650 review nit)
      // +10: gameSettingsModal.reapplyPlan.* (Planner Phase 3.3 re-apply-plan button/confirm/toasts)
      // +5: playtimePlanner.overview.* bulk re-apply (Planner Phase 3.4 update-linked-games)
      // +1: playtimePlanner.overview.reapplyDonePartial (bulk partial-failure toast, PR #650 review)
      // +13: Batch C - _one/_other plural pairs for 7 planner/reapply count strings (+7),
      //      ConfirmationModal titles/labels/warning for plan delete + bulk re-apply (+4),
      //      playtimePlanner.gkShort (+1), playtimePlanner.subs.rowInOut (+1)
      // +1: playtimePlanner.lineup.gameTabs (game tab strip aria-label - 1-tap game switching)
      // +10: plan roster editing (overview.editPlayers + playtimePlanner.players.* - Phase 4)
      // +1: playtimePlanner.lineup.fairnessStrip (worst-first totals strip in the lineup view)
      // +1 net: sub bottom sheet (+5: lineup.subAction, lineup.notInGame, subs.addHint,
      //         subSheet.title, subSheet.halftime; -4: the old dropdown form's
      //         subs.slotLabel/choose/add/noSlots)
      // +7 net: minutes-view redesign (+8: balance zeroMinutes pair, spreadLabel/Detail,
      //         gkLabel/Detail, focusDelta, focusOnShare; -1: notPlaying, absorbed by
      //         the zero-minutes warning)
      // +6: playtimePlanner.overview.suggest* (fair-lineup generator button/confirm/toast)
      // +1: playtimePlanner.overview.gridButton (all-games-side-by-side view)
      // +3 net: plan-manager flow (+4: manager.title/new/meta, lineup.gameName;
      //         -1: versions.switchLabel, dropdown replaced by the manager)
      // -1: playtimePlanner.setup.teamHint (explanatory text under team select removed)
      // +1 net: overview composition rework (+3: overview.notCounted,
      //         lineup.includedToggle/excludedToggle - include dot on game tabs;
      //         -2: overview.included checkbox, overview.rosterSummary - replaced
      //         by roster checkboxes and tab dots)
      // +5: manager 3-dot menu + archive (manager.actions/archive/unarchive/
      //     archivedBadge/showArchived)
      // +4: overview format editor (overview.addGame/removeGame/
      //     trimConfirmTitle/trimConfirmMessage - post-creation plan editing)
      // +1 then -1: lineup.renameGame (pencil rename, superseded same day by
      //     the tap-editable game name in the header)
      // +2 net: tabs restructure (+7: tabs.games/minutes/plan,
      //     lineup.viewToggle/viewSingle/viewGrid, players.replaceTitle;
      //     -5: balance.view, overview.gridButton/editPlayers,
      //     players.title/addHeading - hub buttons replaced by peer tabs)
      // -3 net: field polish (+1 subSheet.existing - in-sheet sub removal;
      //     -4: lineup.hint/pickForSlot/viewToggle, subs.addHint -
      //     instruction copy removed, toggle became one icon button)
      // +2: lineup.noPlayers (zero-player empty state) + loadError (initial
      //     load-failure toast) - review batch B
      // +1: lineup.absentHeading (per-game availability chips)
      // -1 net: review round (+1 lineup.benchEmptyAbsent; -2 dead keys
      //     lineup.benchHeading, overview.newPlan)
      // +2: balance.sitsOut_one/_other (zero-minutes warning split: red = no
      //     minutes ANYWHERE, amber = sits out a full game but plays elsewhere)
      // -3/+2 net -1: menu groups regrouped by scope (see the en note above)
      // +1: controlBar.teamStats (PR 0.2: stats menu entry split match vs team)
      // +5: startScreen home tab bar (see the en note above)
      // +2: startScreen front page (see the en note above)
      // -3: orphaned start-screen button keys pruned (see the en note above)
      // +3: Team tab panel rows (see the en note above)
      // +5: gear bucket keys (see the en note above)
      expect(fiKeys.length).toBe(2822);
    });
  });
});

describe('i18n-types.ts Validation', () => {
  const typesPath = path.join(process.cwd(), 'src/i18n-types.ts');

  it('i18n-types.ts should exist', () => {
    expect(fs.existsSync(typesPath)).toBe(true);
  });

  it('i18n-types.ts should have correct number of keys', () => {
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    // Count the number of translation key entries
    const keyMatches = typesContent.match(/\| '[^']+'/g);
    const keyCount = keyMatches ? keyMatches.length : 0;

    const enContent = fs.readFileSync(enPath, 'utf8');
    const en = JSON.parse(enContent);
    const enKeys = getAllKeys(en);

    expect(keyCount).toBe(enKeys.length);
  });
});
