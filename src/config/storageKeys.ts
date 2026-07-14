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

// Playing-Time Planner: local-only collection of tournament plans (map id -> plan).
// Deliberately not routed through the DataStore/cloud - plans are local-first.
export const PLAYTIME_PLANS_KEY = 'soccerPlaytimePlans';

// Playing-Time Planner Phase 2: planned sub schedules copied onto real games at
// prefill (map gameId -> planned subs). Kept in a SEPARATE local-only store rather
// than on the synced game model on purpose - it never touches the cloud transforms,
// and it survives a cloud pull that replaces the game blob. Cloud sync is deferred.
export const PLAYTIME_GAME_SUBS_KEY = 'soccerPlaytimeGameSubs';

// Playing-Time Planner Phase 3: plan link for games created from a plan (map
// gameId -> {planId, planGameId}). Same local-only rationale as the sub store:
// storing this on the synced game blob proved fragile (autosave snapshots and
// cloud pulls both rebuild the blob and dropped the fields), so the link lives
// here where nothing rewrites it.
export const PLAYTIME_PLAN_LINKS_KEY = 'soccerPlaytimePlanLinks';

// UI state storage keys
export const INSTALL_PROMPT_DISMISSED_KEY = 'installPromptDismissed';

// Data Safety - Layer 2: timestamp (ms) of the last off-device backup (export/share),
// used to drive the periodic "back up your data" reminder.
export const LAST_OFF_DEVICE_BACKUP_KEY = 'lastOffDeviceBackupAt';
// Timestamp (ms) the backup reminder was last dismissed (snooze the banner).
export const BACKUP_REMINDER_DISMISSED_KEY = 'backupReminderDismissedAt';
