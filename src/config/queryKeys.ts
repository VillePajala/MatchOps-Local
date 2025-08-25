export const queryKeys = {
  // Legacy keys (deprecated - use team-aware versions)
  masterRoster: ['masterRoster'] as const,
  seasons: ['seasons'] as const,
  tournaments: ['tournaments'] as const,
  savedGames: ['savedGames'] as const,
  
  // Team-aware keys
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  teamSeasons: (teamId?: string) => ['seasons', teamId ?? 'global'] as const,
  teamTournaments: (teamId?: string) => ['tournaments', teamId ?? 'global'] as const,
  teamSavedGames: (teamId?: string) => ['savedGames', teamId ?? 'all'] as const,
  activeTeamId: ['activeTeamId'] as const,
  
  // Global keys (not team-specific)
  appSettingsCurrentGameId: ['appSettingsCurrentGameId'] as const,
  
  // Example for a detail query if needed later:
  // gameById: (gameId: string) => ['games', 'detail', gameId] as const,
}; 