export const SEASONS_LIST_KEY = 'soccerSeasons';
export const TOURNAMENTS_LIST_KEY = 'soccerTournaments';
export const SAVED_GAMES_KEY = 'savedSoccerGames';
export const APP_SETTINGS_KEY = 'soccerAppSettings';
export const MASTER_ROSTER_KEY = 'soccerMasterRoster';
export const LAST_HOME_TEAM_NAME_KEY = 'lastHomeTeamName';
export const TIMER_STATE_KEY = 'soccerTimerState';
export const PLAYER_ADJUSTMENTS_KEY = 'soccerPlayerAdjustments';

// Multi-team storage keys
export const TEAMS_INDEX_KEY = 'soccerTeamsIndex';
export const TEAM_ROSTERS_KEY = 'soccerTeamRosters';
export const APP_DATA_VERSION_KEY = 'appDataVersion';

// Personnel storage key
export const PERSONNEL_KEY = 'soccerPersonnel';

// Premium license storage key
export const PREMIUM_LICENSE_KEY = 'soccerPremiumLicense';

// Warm-up plan storage key
export const WARMUP_PLAN_KEY = 'soccerWarmupPlan';

// Playing-Time Planner: collection of tournament plans (map id -> plan). Stored
// locally first, outside the DataStore game model; in cloud mode synced to the
// `playtime_plans` table (migration 036, per-plan last-write-wins from 038).
export const PLAYTIME_PLANS_KEY = 'soccerPlaytimePlans';

// Playing-Time Planner Phase 2: planned sub schedules copied onto real games at
// prefill (map gameId -> planned subs). Kept in a SEPARATE store rather than on the
// synced game model on purpose - it never touches the game transforms, and it
// survives a cloud pull that replaces the game blob. Synced on its own to the
// `playtime_game_subs` table (migration 036).
export const PLAYTIME_GAME_SUBS_KEY = 'soccerPlaytimeGameSubs';

// Playing-Time Planner Phase 3: plan link for games created from a plan (map
// gameId -> {planId, planGameId}). Same separate-store rationale as the sub store
// (synced on its own to `playtime_plan_links`, migration 036):
// storing this on the synced game blob proved fragile (autosave snapshots and
// cloud pulls both rebuild the blob and dropped the fields), so the link lives
// here where nothing rewrites it.
export const PLAYTIME_PLAN_LINKS_KEY = 'soccerPlaytimePlanLinks';

// Playbook game themes: the concepts picked for a game (map gameId -> [{playbookId,
// conceptId}] in pick order). Same separate-store rationale as the planner's
// per-game stores - never on the game blob or in the game transforms. Synced on
// its own to `game_themes` (migration 066). The stored key keeps the feature's
// original name ("pelitapa"): renaming it would orphan saved themes.
export const GAME_THEMES_KEY = 'pelitapaGameThemes';

// UI state storage keys
export const INSTALL_PROMPT_DISMISSED_KEY = 'installPromptDismissed';

// Data Safety - Layer 2: timestamp (ms) of the last off-device backup (export/share),
// used to drive the periodic "back up your data" reminder.
export const LAST_OFF_DEVICE_BACKUP_KEY = 'lastOffDeviceBackupAt';
// Timestamp (ms) the backup reminder was last dismissed (snooze the banner).
export const BACKUP_REMINDER_DISMISSED_KEY = 'backupReminderDismissedAt';
/**
 * When this device first held data worth backing up.
 *
 * The reminder's clock starts here rather than at "never backed up", which on a
 * fresh install is true the instant cloud data lands and made the app ask for a
 * backup on a device minutes old.
 */
export const DATA_FIRST_SEEN_KEY = 'dataFirstSeenAt';
