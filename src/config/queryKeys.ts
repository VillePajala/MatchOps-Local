export const queryKeys = {
  // Global entities (not team-specific, according to plan)
  masterRoster: ['masterRoster'] as const,
  seasons: ['seasons'] as const,
  tournaments: ['tournaments'] as const,
  savedGames: ['savedGames'] as const,
  
  // Team-specific entities
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  
  // App settings
  appSettingsCurrentGameId: ['appSettingsCurrentGameId'] as const,
  
  // Example for a detail query if needed later:
  // gameById: (gameId: string) => ['games', 'detail', gameId] as const,
}; 