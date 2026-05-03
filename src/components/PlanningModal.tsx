'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUpTray,
  HiOutlineDocumentDuplicate,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineStar,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2';
// Filled star is absent from `hi2`'s solid set under this name; pulling
// from v1 keeps the active-toggle's filled/outline pair visually consistent.
import { HiStar } from 'react-icons/hi';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import {
  parsePlanExport,
  type ImportedPlan,
  type PlanImportError,
} from '@/utils/planExport';
import type { Player, PlanningSession } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import PlanningGamePicker, {
  type PlanningGamePickerGame,
} from './PlanningGamePicker';
import PlanningEditor from './PlanningEditor';
import PlanningUndoBanner from './PlanningUndoBanner';
import type { ApplySnapshot } from '@/utils/applySnapshot';
import logger from '@/utils/logger';
import {
  useDeletePlanningSessionMutation,
  usePlanningSessionsQuery,
  useSavePlanningSessionMutation,
  useSetActiveSessionMutation,
} from '@/hooks/usePlanningSessionQueries';
import type { PlanDraft } from '@/utils/planSwapEngine';
import { planDraftFromImport } from '@/utils/planFromImport';
import { getPresetById } from '@/config/formationPresets';

type PlanningPage = 'list' | 'picker' | 'editor' | 'undoBanner';

// Guard against missing / malformed updatedAt; `new Date(<bad>)` would render as "Invalid Date".
const formatSessionDate = (
  iso: string | undefined,
  locale: string,
): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
};

interface PlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All saved games keyed by id (from useGamePersistence). */
  savedGames?: SavedGamesCollection;
  /**
   * Active team id — picker filters to games matching this team. Optional;
   * undefined leaves all saved games eligible (for users without team
   * scoping configured).
   */
  currentTeamId?: string;
  /**
   * Active team's display name. Used by the picker as a fallback match
   * for legacy games that have no `teamId` — without this they'd be
   * silently excluded when a team filter is active.
   */
  currentTeamName?: string;
  /** Master roster — required; the editor renders raw UUIDs without it. */
  roster: Player[];
  /** Required — missing at runtime would silently drop saves. */
  applyToGame: (gameId: string, updates: Partial<AppState>) => Promise<void>;
}

const PlanningModal: React.FC<PlanningModalProps> = ({
  isOpen,
  onClose,
  savedGames,
  currentTeamId,
  currentTeamName,
  roster,
  applyToGame,
}) => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<PlanningPage>('list');
  const [editorGameIds, setEditorGameIds] = useState<string[]>([]);
  const [importedPlan, setImportedPlan] = useState<ImportedPlan | null>(null);
  const [importError, setImportError] = useState<PlanImportError | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Reopen flow: when set, the editor hydrates from the saved session's
  // draft and Save updates that session by id rather than creating new.
  const [editingSession, setEditingSession] = useState<PlanningSession | null>(
    null,
  );
  // Entry point that brought the user into the editor. Reopen ('list')
  // bypasses the picker; the picker route ('picker') is the standard
  // new-plan flow. handleEditorBack uses this to return the user to
  // wherever they came from rather than always dropping into the picker.
  const [editorEntryPage, setEditorEntryPage] = useState<'list' | 'picker'>(
    'picker',
  );
  // Rename: when set, the matching row renders as an inline name-input
  // form instead of the static name + meta. Null = no row in rename mode.
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState('');
  /**
   * Inline error message rendered below the saved-session list.
   * Dual-purpose:
   * 1. Delete failures (Codex/Claude PR-391 follow-up) — set in the
   *    delete mutation's `onSettled` error branch.
   * 2. Open failures (corrupt session — empty gameIds, missing draft
   *    for first gameId) — set by handleOpenSession.
   * Cleared on next interaction or when the modal closes.
   */
  const [listErrorMessage, setListErrorMessage] = useState<string | null>(
    null,
  );
  // Standalone-import handoff stash; cleared by resetPendingImport.
  // `undefined` (not `null`) so values flow into the editor's
  // `... | undefined` props with no coercion.
  const [pendingImportDraft, setPendingImportDraft] =
    useState<PlanDraft | undefined>(undefined);
  const [pendingImportPresetId, setPendingImportPresetId] =
    useState<string | undefined>(undefined);
  const [pendingImportName, setPendingImportName] =
    useState<string | undefined>(undefined);
  // Inline alert beside the "Use this plan" button — distinct from
  // listErrorMessage which sits on the list page.
  const [importHandoffError, setImportHandoffError] = useState<string | null>(
    null,
  );
  // Post-apply undo state. Snapshot held for the UNDO_WINDOW_MS span;
  // banner is rendered when page === 'undoBanner'. Cleared on undo
  // success, dismiss, expire, or modal close.
  const [undoSnapshot, setUndoSnapshot] = useState<ApplySnapshot | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  // Mirror of isUndoing kept in a ref for synchronous reads from the
  // banner's 1s timer and from handleClose. The setState happens before
  // applyToGame is awaited, but the closure-captured `isUndoing` in
  // handleUndoExpire wouldn't observe the update until after the paint
  // commit — a narrow window where the timer firing in between would
  // close the modal mid-restore. Two layers protect this:
  //   1. Existing call sites set the ref synchronously *before*
  //      setIsUndoing, closing the race within the same tick.
  //   2. The useEffect below re-syncs after every commit so a future
  //      setIsUndoing call that forgets the manual write still ends
  //      up consistent on the next render.
  const isUndoingRef = useRef(false);
  useEffect(() => {
    isUndoingRef.current = isUndoing;
  }, [isUndoing]);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Index of the next snapshot entry to restore. Advances on each
  // successful applyToGame so a mid-loop failure doesn't redo the
  // already-restored games on retry.
  const [undoCursor, setUndoCursor] = useState(0);

  // Saved sessions are scoped to the active team. The query is gated on
  // (isOpen && page === 'list') so it doesn't fetch while the modal is
  // closed or while the user is in the picker / editor — avoids cache
  // refresh churn during in-flight editing.
  const sessionsEnabled = isOpen && page === 'list';
  const sessionsQuery = usePlanningSessionsQuery({
    teamId: currentTeamId,
    enabled: sessionsEnabled,
  });
  const deleteSession = useDeletePlanningSessionMutation();
  const saveSession = useSavePlanningSessionMutation();
  const setActiveSession = useSetActiveSessionMutation();
  const sessions: PlanningSession[] = sessionsQuery.data ?? [];

  // The editor pulls draft + presetId off this; deriving once keeps the
  // JSX clean. Mirrors the length-guard from handleOpenSession so a
  // malformed session (empty gameIds returned from a partial backend
  // write into setEditingSession(saved)) silently hydrates with
  // undefined rather than reading session.draft[undefined].
  const sessionFirstDraft =
    editingSession && editingSession.gameIds.length > 0
      ? editingSession.draft[editingSession.gameIds[0]]
      : undefined;

  // Convert SavedGamesCollection to the picker's input shape.
  const pickerGames: PlanningGamePickerGame[] = useMemo(() => {
    if (!savedGames) return [];
    return Object.entries(savedGames).map(([id, game]) => ({ id, game }));
  }, [savedGames]);

  const resetImportState = () => {
    setImportedPlan(null);
    setImportError(null);
  };

  const goToList = () => {
    setPage('list');
  };

  // Shared reset for every path that returns the modal to the list page.
  // Extracted so adding new state to the modal can't drift between
  // handleClose / handleEditorApplied / similar callers.
  // Centralized clear for the standalone-import handoff state. Shared
  // by resetEditorState (full editor exits) and the open-existing-
  // session path (which needs to drop pending-import remnants without
  // touching unrelated editor state like undo snapshots).
  const resetPendingImport = () => {
    setPendingImportDraft(undefined);
    setPendingImportPresetId(undefined);
    setPendingImportName(undefined);
    setImportHandoffError(null);
  };

  const resetEditorState = () => {
    setEditorGameIds([]);
    setPendingDeleteId(null);
    setEditingSession(null);
    setListErrorMessage(null);
    setRenamingSessionId(null);
    setRenameDraft('');
    setUndoSnapshot(null);
    setUndoError(null);
    setIsUndoing(false);
    isUndoingRef.current = false;
    setUndoCursor(0);
    // Reset editorEntryPage to 'list' so a future caller that forgets
    // to set it explicitly gets a sensible default — current callers
    // all set it before entering the editor, but this defends against
    // future drift.
    setEditorEntryPage('list');
    resetPendingImport();
  };

  const handleClose = () => {
    // Mid-undo guard: if handleUndoConfirm's applyToGame loop is in
    // flight, its closure-captured handlers will run after we'd reset.
    // Letting close fall through here causes a double resetEditorState
    // + double onClose. Mirror handleUndoExpire's guard.
    if (isUndoingRef.current) return;
    resetImportState();
    resetEditorState();
    setPage('list');
    onClose();
  };

  // Reopen flow: load the session's draft into the editor. The session's
  // draft map is keyed by gameId; current editor edits a single PlanDraft
  // applied to all picked games (homogeneous-set constraint), so we pick
  // the first gameId's draft. PR 7d may relax this if per-game divergence
  // becomes a real product need.
  const handleOpenSession = (session: PlanningSession) => {
    // Empty gameIds is corrupt-session territory — treat it the same as
    // missing draft so the user gets explicit feedback rather than an
    // empty editor.
    const firstDraft: PlanDraft | undefined =
      session.gameIds.length > 0
        ? session.draft[session.gameIds[0]]
        : undefined;
    // Heterogeneous-draft detection: handleSavePlan replicates one draft
    // across every gameId, so a session whose entries diverge can only
    // come from external manipulation or a future per-game-divergence
    // feature. Surface the inconsistency to logs rather than silently
    // dropping the non-first drafts on reopen.
    if (firstDraft && session.gameIds.length > 1) {
      const refKey = JSON.stringify(firstDraft);
      const heterogeneous = session.gameIds.slice(1).some(
        (gid) => JSON.stringify(session.draft[gid]) !== refKey,
      );
      if (heterogeneous) {
        logger.warn(
          '[PlanningModal] Reopened session has heterogeneous per-game drafts; only the first will be loaded into the editor.',
          { sessionId: session.id, gameIds: session.gameIds },
        );
      }
    }
    if (!firstDraft) {
      // Surface the failure rather than silently no-op'ing — a missing
      // draft entry indicates a corrupt session that the user should know
      // about so they can delete it and start over. Also clear any
      // editingSession from a prior valid Open so stale state doesn't
      // linger behind the error banner.
      setEditingSession(null);
      setListErrorMessage(
        t(
          'planningModal.openSessionFailed',
          'Could not open this plan. Its data may be corrupt.',
        ),
      );
      return;
    }
    resetImportState();
    // Clear any pending standalone-import handoff — otherwise an
    // import whose picker the user backed out of would leak its
    // pendingImportPresetId into the reopen path, and a session
    // whose draft has no presetId would silently render against
    // the import's preset (the second `??` in the editor's
    // initialPresetId chain wins when sessionFirstDraft.presetId
    // is undefined).
    resetPendingImport();
    setListErrorMessage(null);
    // Clear any half-confirmed delete from the list — without this, a
    // user who clicks Delete on session A, then Open on session B,
    // would return to the list later with A's "Confirm delete?" row
    // still visible.
    setPendingDeleteId(null);
    // Clear any in-progress rename on a different row — without this,
    // pressing Back from the editor returns the user to a list where
    // the prior row is still showing the rename form.
    setRenamingSessionId(null);
    setRenameDraft('');
    setEditingSession(session);
    setEditorGameIds([...session.gameIds]);
    setEditorEntryPage('list');
    setPage('editor');
  };

  const handleSavePlan = async (data: {
    sessionId: string | undefined;
    name: string;
    draft: PlanDraft;
    gameIds: string[];
  }) => {
    // currentTeamId is gated upstream (onSavePlan is only wired when
    // it exists). If the gate is bypassed somehow (rapid sign-out
    // between click and async settle), throwing surfaces an error to
    // the editor's existing catch — silently returning would let the
    // form close as if the save succeeded when nothing was written.
    if (!currentTeamId) {
      throw new Error('Cannot save planning session without a team scope');
    }
    // The editor produces ONE PlanDraft applied to all picked games; the
    // session entity stores draft per gameId. Deep-copy each entry so
    // future per-game divergence won't accidentally mutate shared
    // references. Shallow-copy at each layer is sufficient because
    // DraftScheduledSub fields are all primitives — if a nested object
    // ever gets added, this needs to recurse one level deeper.
    const replicated: Record<string, PlanDraft> = {};
    for (const gid of data.gameIds) {
      replicated[gid] = {
        ...data.draft,
        startingXI: { ...data.draft.startingXI },
        bench: [...data.draft.bench],
        scheduledSubs: data.draft.scheduledSubs.map((s) => ({ ...s })),
      };
    }
    const saved = await saveSession.mutateAsync({
      id: data.sessionId,
      teamId: currentTeamId,
      name: data.name,
      gameIds: [...data.gameIds],
      draft: replicated,
      isActive: editingSession?.isActive ?? false,
      appliedAt: editingSession?.appliedAt,
      createdAt: editingSession?.createdAt,
    });
    // Stay in the editor with the (possibly newly-created) session
    // attached so subsequent edits update in place.
    setEditingSession(saved);
  };

  // ── Row actions (Rename / Duplicate / Active-toggle) ────────────────
  // All three reuse the existing planning-session mutations (save +
  // setActive); the row-level UI just composes them.

  const handleStartRename = (session: PlanningSession) => {
    setListErrorMessage(null);
    setPendingDeleteId(null);
    setRenamingSessionId(session.id);
    setRenameDraft(session.name);
  };

  const handleCancelRename = () => {
    setRenamingSessionId(null);
    setRenameDraft('');
    // Clear any rename-time validation banner — without this, a user
    // who hit "Plan name is required" then Cancel would see the banner
    // persist past their explicit abandon.
    setListErrorMessage(null);
  };

  const handleConfirmRename = async (session: PlanningSession) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      // Empty after trim: validator would reject anyway; bail with an
      // inline error so the user gets feedback before round-tripping.
      setListErrorMessage(
        t(
          'planningModal.renameNameRequired',
          'Plan name is required.',
        ),
      );
      return;
    }
    // Clear any prior error from a previous failed attempt — without
    // this, a "name required" warning would persist past a successful
    // retry and incorrectly signal failure.
    setListErrorMessage(null);
    try {
      await saveSession.mutateAsync({
        id: session.id,
        teamId: session.teamId,
        name: trimmed,
        gameIds: [...session.gameIds],
        // Preserve the existing draft + metadata; rename mutates name
        // only (and updatedAt, which the DataStore stamps).
        draft: session.draft,
        isActive: session.isActive,
        appliedAt: session.appliedAt,
        createdAt: session.createdAt,
      });
      setRenamingSessionId(null);
      setRenameDraft('');
    } catch {
      setListErrorMessage(
        t(
          'planningModal.renameFailed',
          'Could not rename the plan. Please try again.',
        ),
      );
    }
  };

  const handleDuplicate = async (session: PlanningSession) => {
    setListErrorMessage(null);
    try {
      await saveSession.mutateAsync({
        // id omitted → DataStore generates a new one. Clone everything
        // else but reset isActive (only one active plan per scope) and
        // appliedAt (the duplicate hasn't been applied yet). createdAt
        // is also omitted on purpose so the DataStore stamps a fresh
        // timestamp for the new copy rather than carrying the original's.
        teamId: session.teamId,
        name: t(
          'planningModal.duplicateNameSuffix',
          '{{name}} (copy)',
          { name: session.name },
        ),
        gameIds: [...session.gameIds],
        draft: session.draft,
        isActive: false,
        // PlanningSession.appliedAt is `string | undefined`; passing
        // undefined is the canonical "not yet applied" sentinel.
        // SupabaseDataStore.transformPlanningSessionToDb maps this to
        // SQL NULL, so the round-trip is preserved across both backends.
        appliedAt: undefined,
      });
    } catch {
      setListErrorMessage(
        t(
          'planningModal.duplicateFailed',
          'Could not duplicate the plan. Please try again.',
        ),
      );
    }
  };

  const handleToggleActive = async (session: PlanningSession) => {
    setListErrorMessage(null);
    // Fire-and-forget: errors are surfaced via the onError callback
    // rather than a try/catch around mutateAsync. Either pattern works
    // with React Query; the onError style keeps the handler synchronous
    // for the common case where the user clicks and walks away.
    //
    // Pass null when the session is currently active to deactivate;
    // pass the id to activate (the RPC also deactivates other in-scope
    // sessions atomically).
    setActiveSession.mutate(
      {
        sessionId: session.isActive ? null : session.id,
        teamId: session.teamId,
        gameIds: [...session.gameIds],
      },
      {
        onError: () => {
          setListErrorMessage(
            t(
              'planningModal.activeToggleFailed',
              'Could not change the default plan. Please try again.',
            ),
          );
        },
      },
    );
  };

  const handleNewPlan = () => {
    resetImportState();
    // resetEditorState clears every editor-adjacent state field
    // (editingSession, listErrorMessage, pendingImport*, undo*).
    // Without it, an import whose picker the user backed out of
    // would leak pendingImportDraft into the next New Plan flow
    // and inject the stale draft into a brand-new editor session.
    resetEditorState();
    setPage('picker');
  };

  const handlePickerContinue = (gameIds: string[]) => {
    // Picker's validation already blocks Continue on empty selection;
    // guarding here makes the contract explicit at the call site.
    if (gameIds.length === 0) return;
    setEditorGameIds(gameIds);
    setEditorEntryPage('picker');
    setPage('editor');
  };

  // Hands an imported standalone plan off to the editor: derive a
  // PlanDraft from the first imported game's startingXI + scheduledSubs
  // (the editor uses one shared draft across the picked games), stash
  // the suggested name + preset, then route to the picker so the user
  // binds the imported plan to actual saved games. Save creates the
  // PlanningSession via the existing handleSavePlan flow.
  const handleUseImportedPlan = () => {
    if (!importedPlan) return;
    setImportHandoffError(null);
    const firstGame = importedPlan.games[0];
    if (!firstGame) {
      // parsePlanExport already rejects zero-game envelopes, so this
      // is defense-in-depth. Inline to the success card so the user
      // sees the failure next to the button they just pressed.
      setImportHandoffError(
        t(
          'planningModal.importNoGamesError',
          'Imported plan has no games. Pick a different file.',
        ),
      );
      return;
    }
    // Route the imported envelope through the shared normalizer so
    // empty role slots, duplicate role assignments, and players outside
    // the team roster are handled identically to the rest of the
    // import surface area. Bench is derived from the team roster minus
    // assigned starters; the editor uses this draft as-is when the
    // user lands on it via the picker handoff.
    const { draft } = planDraftFromImport(firstGame, roster);
    // Only carry the formationId if it resolves to a known preset; an
    // unknown id would fail the editor's preset lookup silently.
    const presetMatch = importedPlan.formationId
      ? getPresetById(importedPlan.formationId)
      : undefined;
    setPendingImportDraft(draft);
    setPendingImportPresetId(presetMatch?.id);
    setPendingImportName(
      // `||` (not `??`) intentional: an empty-string version name is
      // as unusable as null for a plan, so both should fall through
      // to the default.
      importedPlan.currentVersionName ||
        t('planningModal.importedPlanDefaultName', 'Imported plan'),
    );
    // Clear the import banner so the user sees the picker, not a
    // stale success card from the previous step.
    resetImportState();
    setPage('picker');
    setEditorEntryPage('picker');
  };

  const handleEditorBack = () => {
    // Reset editingSession: the reopen path bypasses the picker, so
    // without this clear, "back from editor → pick different games →
    // Save" would silently overwrite the original session.
    setEditingSession(null);
    // Route back to wherever the editor was entered from. Reopen entry
    // ('list') drops directly back to the saved-session list; picker
    // entry ('picker') drops back into the picker for game-selection
    // adjustments before another Continue.
    setPage(editorEntryPage);
  };

  const handleEditorApplied = (snapshot?: ApplySnapshot) => {
    // The modal stays mounted across opens (`isOpen={false}` early-returns
    // null but doesn't unmount), so explicit resets are required to
    // prevent stale banners / editingSession from leaking into the next
    // open. Shared with handleClose via resetEditorState.

    // Stamp appliedAt on the session so the metadata reflects when the
    // plan was last applied. Fire-and-forget — Apply has already
    // succeeded against the games (the snapshot proves it), so a
    // failure to update this metadata mustn't block the undo banner.
    // Captured before resetEditorState() clears editingSession.
    const sessionToStamp = editingSession;
    if (sessionToStamp) {
      saveSession
        .mutateAsync({
          id: sessionToStamp.id,
          teamId: sessionToStamp.teamId,
          name: sessionToStamp.name,
          gameIds: sessionToStamp.gameIds,
          draft: sessionToStamp.draft,
          isActive: sessionToStamp.isActive,
          appliedAt: new Date().toISOString(),
          createdAt: sessionToStamp.createdAt,
        })
        .catch((err) => {
          logger.warn(
            '[PlanningModal] Failed to stamp appliedAt — Apply succeeded but metadata is stale',
            err,
          );
        });
    }

    if (snapshot && snapshot.games.length > 0) {
      // Full-success apply with at least one game mutated — switch the
      // modal into undo-banner mode instead of closing. Calling
      // resetEditorState first keeps this path in sync with future
      // additions there; React batches the override below into the
      // same commit so the user never sees a flash of empty state.
      resetEditorState();
      setUndoSnapshot(snapshot);
      setPage('undoBanner');
      return;
    }
    // No snapshot (warning path that still closed the editor — unlikely
    // since the warning path returns early without onApplied — but
    // defensive). Fall back to the original close behavior.
    resetEditorState();
    setPage('list');
    onClose();
  };

  const handleUndoDismiss = () => {
    resetEditorState();
    setPage('list');
    onClose();
  };

  const handleUndoExpire = () => {
    // Don't tear down the modal while an undo is in flight; the
    // applyToGame loop will resolve and either close cleanly on
    // success or surface undoError on the still-mounted banner for
    // retry. The ref read closes a sub-paint stale-closure window
    // that the state-only check would otherwise miss.
    if (isUndoingRef.current) return;
    // Same effect as Dismiss: close the modal and forget the snapshot.
    // Kept as a separate name so the test suite can assert which path
    // fired (timeout vs. user click).
    resetEditorState();
    setPage('list');
    onClose();
  };

  const handleUndoConfirm = async () => {
    if (!undoSnapshot || isUndoing) return;
    isUndoingRef.current = true;
    setIsUndoing(true);
    setUndoError(null);
    // Resume from undoCursor so a retry after a mid-loop failure
    // doesn't re-restore the games that already succeeded — those
    // are already at their pre-apply state.
    let cursor = undoCursor;
    try {
      while (cursor < undoSnapshot.games.length) {
        const entry = undoSnapshot.games[cursor];
        await applyToGame(entry.gameId, entry.before);
        cursor++;
      }
      resetEditorState();
      setPage('list');
      onClose();
    } catch (err) {
      logger.error('[PlanningModal] Undo failed', err);
      setUndoCursor(cursor);
      // Different copy when at least one game has been restored
      // already so the user knows where the retry will pick up,
      // versus the all-or-nothing first-game failure.
      const messageKey =
        cursor > 0
          ? 'planningUndoBanner.undoFailedPartial'
          : 'planningUndoBanner.undoFailed';
      const messageDefault =
        cursor > 0
          ? 'Restored {{done}} of {{total}} games. Click Undo to finish.'
          : 'Could not undo the apply. Please try again.';
      setUndoError(
        t(messageKey, messageDefault, {
          done: cursor,
          total: undoSnapshot.games.length,
        }),
      );
      setIsUndoing(false);
      isUndoingRef.current = false;
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;

    resetImportState();
    // Plans are tiny — 1 MB is generous. Guard against accidental large
    // files that would stall the main thread on low-memory mobile devices.
    const MAX_BYTES = 1 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setImportError({
        message: t(
          'planningModal.fileTooLarge',
          'File is too large (over 1 MB). Plans should be a few KB; please check the file.',
        ),
      });
      return;
    }
    // FileReader rather than `file.text()` for broader runtime support
    // (jsdom's File polyfill in tests, older mobile Safari).
    const reader = new FileReader();
    reader.onerror = () =>
      setImportError({
        message: t('planningModal.readError', 'Failed to read file.'),
      });
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parsePlanExport(text);
      if (result.ok) {
        setImportedPlan(result.plan);
      } else {
        setImportError(result.error);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display"
      data-testid="planning-modal"
    >
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />

        <div className="relative z-10 flex flex-col min-h-0 h-full">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {t('planningModal.title', 'Planning')}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner space-y-6">
              {page === 'list' && (
                <>
                  {/* Saved-session list */}
                  {!importedPlan && !importError && sessionsQuery.isLoading && (
                    <div
                      className="text-center py-6 text-slate-300 text-sm"
                      role="status"
                    >
                      {t('planningModal.sessionsLoading', 'Loading saved plans…')}
                    </div>
                  )}

                  {/* Error banner: replaces the blank state on fetch failure. */}
                  {!importedPlan && !importError && sessionsQuery.isError && (
                    <p
                      className="text-center text-sm text-rose-300 py-4"
                      role="alert"
                      data-testid="planning-modal-sessions-error"
                    >
                      {t(
                        'planningModal.sessionsLoadError',
                        'Could not load saved plans. Please try again.',
                      )}
                    </p>
                  )}

                  {/* Empty state: reserved for genuine empty-but-successful — !isError keeps it from masking a fetch failure. */}
                  {!importedPlan &&
                    !importError &&
                    !sessionsQuery.isLoading &&
                    !sessionsQuery.isError &&
                    sessions.length === 0 && (
                      <div className="space-y-3 text-center py-8">
                        <p className="text-slate-200 text-base">
                          {t(
                            'planningModal.emptyTitle',
                            'No saved planning sessions yet.',
                          )}
                        </p>
                        <p className="text-slate-400 text-sm">
                          {t(
                            'planningModal.emptyHint',
                            'Start a new plan from your saved games, or import a plan exported from the standalone planner.',
                          )}
                        </p>
                      </div>
                    )}

                  {/* List: !isError + !isLoading guards against either banner co-rendering with stale data. */}
                  {!importedPlan &&
                    !importError &&
                    !sessionsQuery.isError &&
                    !sessionsQuery.isLoading &&
                    sessions.length > 0 && (
                      <div
                        className="space-y-2"
                        data-testid="planning-modal-session-list"
                      >
                        <h3
                          id="planning-modal-session-heading"
                          className="text-sm font-semibold text-slate-200"
                        >
                          {t(
                            'planningModal.savedSessionsHeading',
                            'Saved plans',
                          )}
                        </h3>
                        <ul
                          aria-labelledby="planning-modal-session-heading"
                          className="space-y-2"
                        >
                          {sessions.map((session) => {
                            const isPending = pendingDeleteId === session.id;
                            const isRenaming =
                              renamingSessionId === session.id;
                            return (
                              <li
                                key={session.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2"
                              >
                                {isRenaming ? (
                                  <form
                                    className="flex flex-1 items-center gap-2"
                                    data-testid={`planning-session-rename-form-${session.id}`}
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void handleConfirmRename(session);
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={renameDraft}
                                      onChange={(e) =>
                                        setRenameDraft(e.target.value)
                                      }
                                      // Esc cancels — keyboard-only users
                                      // shouldn't have to Tab to the Cancel
                                      // button to abandon the edit.
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleCancelRename();
                                        }
                                      }}
                                      autoFocus
                                      className="flex-1 rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1 text-sm text-slate-100"
                                      aria-label={t(
                                        'planningModal.renameInputAriaLabel',
                                        'New name',
                                      )}
                                      data-testid={`planning-session-rename-input-${session.id}`}
                                    />
                                    <button
                                      type="submit"
                                      disabled={saveSession.isPending}
                                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                                      data-testid={`planning-session-rename-confirm-${session.id}`}
                                    >
                                      {t('common.save', 'Save')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelRename}
                                      className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
                                      data-testid={`planning-session-rename-cancel-${session.id}`}
                                    >
                                      {t('common.cancel', 'Cancel')}
                                    </button>
                                  </form>
                                ) : (
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-sm font-medium text-slate-100">
                                        {session.name}
                                      </span>
                                      {session.isActive && (
                                        <span className="rounded-full bg-emerald-700/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                                          {t(
                                            'planningModal.activeBadge',
                                            'Active',
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400">
                                      {t(
                                        'planningModal.gameCountLabel',
                                        '{{count}} games',
                                        { count: session.gameIds.length },
                                      )}
                                      {' · '}
                                      {t(
                                        'planningModal.updatedAtLabel',
                                        'updated {{date}}',
                                        {
                                          date: formatSessionDate(
                                            session.updatedAt,
                                            i18n.language,
                                          ),
                                        },
                                      )}
                                    </p>
                                  </div>
                                )}

                                {isRenaming ? null : isPending ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      // mutate (not mutateAsync) so React Query absorbs rejections; isPending blocks double-submit.
                                      onClick={() => {
                                        setListErrorMessage(null);
                                        deleteSession.mutate(session.id, {
                                          onSettled: (
                                            _data,
                                            err,
                                          ) => {
                                            setPendingDeleteId(null);
                                            // Surface delete failures inline; success path leaves message null.
                                            if (err) {
                                              setListErrorMessage(
                                                t(
                                                  'planningModal.deleteFailed',
                                                  'Could not delete the plan. Please try again.',
                                                ),
                                              );
                                            }
                                          },
                                        });
                                      }}
                                      disabled={deleteSession.isPending}
                                      className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                                      data-testid={`planning-session-delete-confirm-${session.id}`}
                                    >
                                      {t(
                                        'planningModal.deleteConfirm',
                                        'Confirm delete?',
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDeleteId(null)}
                                      className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
                                    >
                                      {t('common.cancel', 'Cancel')}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenSession(session)
                                      }
                                      className="rounded-md bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-600"
                                      // Per-session aria-label so screen
                                      // readers can disambiguate the column
                                      // of identical "Open" buttons.
                                      aria-label={t(
                                        'planningModal.openSessionAriaLabel',
                                        'Open {{name}}',
                                        { name: session.name },
                                      )}
                                      data-testid={`planning-session-open-${session.id}`}
                                    >
                                      {t(
                                        'planningModal.openSession',
                                        'Open',
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleActive(session)}
                                      // Single mutation instance → all rows
                                      // share isPending. Acceptable at this
                                      // scale (the operation is fast); per-
                                      // row gating would require tracking
                                      // which session is in flight.
                                      disabled={setActiveSession.isPending}
                                      className={
                                        session.isActive
                                          ? 'rounded-md p-1.5 text-amber-300 hover:bg-amber-900/40 disabled:opacity-60'
                                          : 'rounded-md p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-60'
                                      }
                                      aria-label={
                                        session.isActive
                                          ? t(
                                              'planningModal.deactivateAriaLabel',
                                              'Deactivate {{name}}',
                                              { name: session.name },
                                            )
                                          : t(
                                              'planningModal.activateAriaLabel',
                                              'Activate {{name}}',
                                              { name: session.name },
                                            )
                                      }
                                      aria-pressed={session.isActive}
                                      data-testid={`planning-session-active-toggle-${session.id}`}
                                    >
                                      {session.isActive ? (
                                        <HiStar className="h-4 w-4" />
                                      ) : (
                                        <HiOutlineStar className="h-4 w-4" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartRename(session)}
                                      // saveSession is shared across rename
                                      // and duplicate, so a Duplicate in
                                      // flight disables every row's Rename
                                      // button (and vice versa). Acceptable
                                      // at this scale; per-row gating would
                                      // need separate mutation instances.
                                      disabled={saveSession.isPending}
                                      className="rounded-md p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-60"
                                      aria-label={t(
                                        'planningModal.renameAriaLabel',
                                        'Rename {{name}}',
                                        { name: session.name },
                                      )}
                                      data-testid={`planning-session-rename-${session.id}`}
                                    >
                                      <HiOutlinePencilSquare className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicate(session)}
                                      disabled={saveSession.isPending}
                                      className="rounded-md p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-60"
                                      aria-label={t(
                                        'planningModal.duplicateAriaLabel',
                                        'Duplicate {{name}}',
                                        { name: session.name },
                                      )}
                                      data-testid={`planning-session-duplicate-${session.id}`}
                                    >
                                      <HiOutlineDocumentDuplicate className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setListErrorMessage(null);
                                        setPendingDeleteId(session.id);
                                      }}
                                      className="rounded-md p-1.5 text-slate-300 hover:bg-rose-900/40 hover:text-rose-200"
                                      aria-label={t(
                                        'planningModal.deleteSession',
                                        'Delete plan',
                                      )}
                                      data-testid={`planning-session-delete-${session.id}`}
                                    >
                                      <HiOutlineTrash className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {/* Inline error banner: delete failures, open failures (corrupt session), etc. */}
                        {listErrorMessage && (
                          <p
                            className="text-sm text-rose-300"
                            role="alert"
                            data-testid="planning-modal-list-error"
                          >
                            {listErrorMessage}
                          </p>
                        )}
                      </div>
                    )}

                  {/* Import success */}
                  {importedPlan && (
                    <div className="space-y-3 rounded-md bg-emerald-900/30 border border-emerald-700/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-emerald-200">
                          {t('planningModal.importSuccessTitle', 'Plan imported')}
                        </h3>
                        <button
                          type="button"
                          onClick={resetImportState}
                          className="rounded-md p-1 text-emerald-200 hover:bg-emerald-900/50"
                          aria-label={t('planningModal.dismissImport', 'Dismiss')}
                        >
                          <HiOutlineXMark className="h-4 w-4" />
                        </button>
                      </div>
                      <ul className="text-sm text-emerald-100/90 space-y-1">
                        <li>
                          <strong>{t('planningModal.team', 'Team')}:</strong>{' '}
                          {importedPlan.teamName}
                        </li>
                        <li>
                          <strong>{t('planningModal.formation', 'Formation')}:</strong>{' '}
                          {importedPlan.formationId}
                        </li>
                        <li>
                          <strong>{t('planningModal.gameCount', 'Games')}:</strong>{' '}
                          {importedPlan.games.length}
                        </li>
                        <li>
                          <strong>{t('planningModal.subCount', 'Scheduled subs')}:</strong>{' '}
                          {importedPlan.games.reduce(
                            (n, g) => n + g.scheduledSubs.length,
                            0,
                          )}
                        </li>
                      </ul>
                      <p className="text-xs text-emerald-200/80 pt-2">
                        {t(
                          'planningModal.importNextStep',
                          'Pick the saved games to bind this plan to, then Save to create a planning session.',
                        )}
                      </p>
                      {importHandoffError && (
                        <p
                          role="alert"
                          className="text-xs text-rose-200"
                          data-testid="planning-modal-import-handoff-error"
                        >
                          {importHandoffError}
                        </p>
                      )}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleUseImportedPlan}
                          data-testid="planning-modal-import-use"
                          className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow hover:bg-emerald-400"
                        >
                          {t(
                            'planningModal.useImportedPlan',
                            'Use this plan →',
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Import failure */}
                  {importError && (
                    <div className="space-y-2 rounded-md bg-rose-900/30 border border-rose-700/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-rose-200">
                          {t('planningModal.importFailedTitle', 'Import failed')}
                        </h3>
                        <button
                          type="button"
                          onClick={resetImportState}
                          className="rounded-md p-1 text-rose-200 hover:bg-rose-900/50"
                          aria-label={t('planningModal.dismissImport', 'Dismiss')}
                        >
                          <HiOutlineXMark className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm text-rose-100/90">{importError.message}</p>
                      {importError.path ? (
                        <p className="text-xs font-mono text-rose-200/80">
                          {t('planningModal.errorPath', 'at')}: {importError.path}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleNewPlan}
                      className="inline-flex items-center gap-2 rounded-md bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400"
                    >
                      <HiOutlinePlus className="h-4 w-4" />
                      {t('planningModal.newPlanButton', 'New plan')}
                    </button>
                    <button
                      type="button"
                      onClick={handleImportClick}
                      className="inline-flex items-center gap-2 rounded-md bg-slate-700/70 px-4 py-2 text-sm font-semibold text-slate-100 shadow hover:bg-slate-600"
                    >
                      <HiOutlineArrowUpTray className="h-4 w-4" />
                      {t('planningModal.importButton', 'Import plan from JSON')}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="planning-modal-file-input"
                    />
                  </div>
                </>
              )}

              {page === 'picker' && (
                <PlanningGamePicker
                  games={pickerGames}
                  teamFilterId={currentTeamId}
                  teamFilterName={currentTeamName}
                  onBack={goToList}
                  onContinue={handlePickerContinue}
                />
              )}

              {page === 'undoBanner' && undoSnapshot && (
                <PlanningUndoBanner
                  gameCount={undoSnapshot.games.length}
                  appliedAt={undoSnapshot.appliedAt}
                  isUndoing={isUndoing}
                  undoError={undoError}
                  onUndo={() => void handleUndoConfirm()}
                  onDismiss={handleUndoDismiss}
                  onExpire={handleUndoExpire}
                />
              )}

              {page === 'editor' && (
                <PlanningEditor
                  gameIds={editorGameIds}
                  savedGames={savedGames ?? {}}
                  roster={roster}
                  onBack={handleEditorBack}
                  onApplied={handleEditorApplied}
                  applyToGame={applyToGame}
                  // Three initial-state sources, checked in priority
                  // order: reopen of an existing session, then the
                  // standalone-import handoff, then game-derived default.
                  initialDraft={sessionFirstDraft ?? pendingImportDraft}
                  // Preset is stored on the draft so reopen renders the
                  // SAME role grid the user authored under — role keys
                  // differ across presets (LM/RM vs LB/RB), so a
                  // mismatched preset would drop assignments.
                  initialPresetId={
                    sessionFirstDraft?.presetId ?? pendingImportPresetId
                  }
                  initialName={editingSession?.name ?? pendingImportName}
                  editingSessionId={editingSession?.id}
                  // currentTeamId required for Save (the entity is
                  // team-scoped). When absent, Save button is hidden —
                  // user can still Apply but not persist.
                  onSavePlan={
                    currentTeamId ? handleSavePlan : undefined
                  }
                  // Gate Apply behind a per-game diff preview so the
                  // coach can see (and selectively skip) what's about
                  // to change.
                  enableApplyPreview
                />
              )}
            </div>
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={handleClose}
              className={primaryButtonStyle}
              data-testid="planning-modal-done"
            >
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>
    </div>
  );
};

export default PlanningModal;
