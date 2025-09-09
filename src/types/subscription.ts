// Subscription types for freemium model
export type SubscriptionTier = 'free' | 'premium';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt?: string; // ISO date string
  purchasedAt?: string; // ISO date string
  platform?: 'web' | 'ios' | 'android';
  subscriptionId?: string;
}

export interface FeatureLimits {
  maxTeams: number;
  maxPlayersPerTeam: number;
  maxGamesPerSeason: number;
  maxTacticalDrawings: number;
  canExportData: boolean;
  canManageSeasons: boolean;
  canUseTournaments: boolean;
  canUseAdvancedStats: boolean;
  canUseCloudBackup: boolean;
}

// Feature limits by tier
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, FeatureLimits> = {
  free: {
    maxTeams: 1,
    maxPlayersPerTeam: 15,
    maxGamesPerSeason: 10,
    maxTacticalDrawings: 3,
    canExportData: false,
    canManageSeasons: false,
    canUseTournaments: false,
    canUseAdvancedStats: false,
    canUseCloudBackup: false,
  },
  premium: {
    maxTeams: Infinity,
    maxPlayersPerTeam: Infinity,
    maxGamesPerSeason: Infinity,
    maxTacticalDrawings: Infinity,
    canExportData: true,
    canManageSeasons: true,
    canUseTournaments: true,
    canUseAdvancedStats: true,
    canUseCloudBackup: true,
  },
};