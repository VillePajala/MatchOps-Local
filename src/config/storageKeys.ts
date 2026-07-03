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

// UI state storage keys
export const INSTALL_PROMPT_DISMISSED_KEY = 'installPromptDismissed';

// Data Safety - Layer 2: timestamp (ms) of the last off-device backup (export/share),
// used to drive the periodic "back up your data" reminder.
export const LAST_OFF_DEVICE_BACKUP_KEY = 'lastOffDeviceBackupAt';
// Timestamp (ms) the backup reminder was last dismissed (snooze the banner).
export const BACKUP_REMINDER_DISMISSED_KEY = 'backupReminderDismissedAt';
