import { z } from 'zod';

export const pointSchema = z.object({
  relX: z.number().min(0).max(1),
  relY: z.number().min(0).max(1),
});

export const opponentSchema = z.object({
  id: z.string().min(1),
  relX: z.number().min(0).max(1),
  relY: z.number().min(0).max(1),
});

export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Player name is required'),
  nickname: z.string().optional(),
  relX: z.number().min(0).max(1).optional(),
  relY: z.number().min(0).max(1).optional(),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code')
    .optional(),
  isGoalie: z.boolean().optional(),
  jerseyNumber: z.string()
    .regex(/^\d{1,3}$/, 'Jersey number must be 1-3 digits')
    .optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  receivedFairPlayCard: z.boolean().optional(),
});

export const gameEventSchema = z.object({
  id: z.string(),
  type: z.enum(['goal', 'opponentGoal', 'substitution', 'periodEnd', 'gameEnd', 'fairPlayCard']),
  time: z.number(),
  scorerId: z.string().optional(),
  assisterId: z.string().optional(),
  entityId: z.string().optional(),
});

export const intervalLogSchema = z.object({
  period: z.number(),
  duration: z.number(),
  timestamp: z.number(),
});

export const tacticalDiscSchema = z.object({
  id: z.string(),
  relX: z.number(),
  relY: z.number(),
  type: z.enum(['home', 'opponent', 'goalie']),
});

export const playerAssessmentSchema = z.object({
  overall: z.number(),
  sliders: z.object({
    intensity: z.number(),
    courage: z.number(),
    duels: z.number(),
    technique: z.number(),
    creativity: z.number(),
    decisions: z.number(),
    awareness: z.number(),
    teamwork: z.number(),
    fair_play: z.number(),
    impact: z.number(),
  }),
  notes: z.string(),
  minutesPlayed: z.number(),
  createdAt: z.number(),
  createdBy: z.string(),
});

export const appStateSchema = z.object({
  playersOnField: z.array(playerSchema),
  opponents: z.array(opponentSchema),
  drawings: z.array(z.array(pointSchema)),
  availablePlayers: z.array(playerSchema),
  showPlayerNames: z.boolean(),
  teamName: z.string().min(1, 'Team name is required'),
  gameEvents: z.array(gameEventSchema),
  opponentName: z.string().min(1, 'Opponent name is required'),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  homeScore: z.number().min(0, 'Score cannot be negative').int('Score must be an integer'),
  awayScore: z.number().min(0, 'Score cannot be negative').int('Score must be an integer'),
  gameNotes: z.string(),
  homeOrAway: z.enum(['home', 'away']),
  numberOfPeriods: z.union([z.literal(1), z.literal(2)]),
  periodDurationMinutes: z.number()
    .min(1, 'Period duration must be at least 1 minute')
    .max(120, 'Period duration cannot exceed 120 minutes')
    .int('Period duration must be an integer'),
  currentPeriod: z.number()
    .min(1, 'Current period must be at least 1')
    .max(2, 'Current period cannot exceed 2')
    .int('Current period must be an integer'),
  gameStatus: z.enum(['notStarted', 'inProgress', 'periodEnd', 'gameEnd']),
  selectedPlayerIds: z.array(z.string()),
  assessments: z.record(z.string(), playerAssessmentSchema).optional(),
  seasonId: z.string(),
  tournamentId: z.string(),
  tournamentLevel: z.string().optional(),
  ageGroup: z.string().optional(),
  demandFactor: z.number()
    .min(0.1, 'Demand factor must be at least 0.1')
    .max(10, 'Demand factor cannot exceed 10')
    .optional()
    .default(1),
  gameLocation: z.string().optional(),
  gameTime: z.string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format')
    .optional(),
  subIntervalMinutes: z.number()
    .min(1, 'Sub interval must be at least 1 minute')
    .max(60, 'Sub interval cannot exceed 60 minutes')
    .optional(),
  completedIntervalDurations: z.array(intervalLogSchema).optional(),
  lastSubConfirmationTimeSeconds: z.number().min(0).optional(),
  tacticalDiscs: z.array(tacticalDiscSchema),
  tacticalDrawings: z.array(z.array(pointSchema)),
  tacticalBallPosition: pointSchema.nullable(),
  isPlayed: z.boolean().optional(),
  teamId: z.string().optional(),
});

export type AppStateSchema = typeof appStateSchema;
export type AppStateSchemaType = z.infer<typeof appStateSchema>;
