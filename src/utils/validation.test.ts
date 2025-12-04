/**
 * Tests for validation utilities
 * @critical - Data integrity validation for teams and players
 */

import {
  validateTeam,
  validatePlayer,
  validateRoster,
  sanitizeTeamName,
  sanitizePlayerName,
  sanitizeNotes,
  logValidationError,
  isValidTeamId,
  isValidPlayerId,
  validateTeamIntegrity,
  ValidationError,
} from './validation';
import { Team, TeamPlayer } from '@/types';
import logger from '@/utils/logger';

// Mock logger
jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('validation utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // validateTeam
  // ============================================
  describe('validateTeam', () => {
    it('should pass validation for valid team', () => {
      const team = { name: 'FC Barcelona', color: '#A50044' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when team name is missing', () => {
      const team = { color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Team name is required',
      });
    });

    it('should fail when team name is empty string', () => {
      const team = { name: '', color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Team name is required',
      });
    });

    it('should fail when team name is only whitespace', () => {
      const team = { name: '   ', color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Team name is required',
      });
    });

    it('should fail when team name exceeds 50 characters', () => {
      const team = { name: 'A'.repeat(51), color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Team name must be 50 characters or less',
      });
    });

    it('should pass when team name is exactly 50 characters', () => {
      const team = { name: 'A'.repeat(50), color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(true);
    });

    it('should fail when color is invalid hex format', () => {
      const team = { name: 'Team', color: 'red' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'color',
        message: 'Team color must be a valid hex color',
      });
    });

    it('should fail when color is incomplete hex', () => {
      const team = { name: 'Team', color: '#FFF' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'color',
        message: 'Team color must be a valid hex color',
      });
    });

    it('should pass when color is valid 6-digit hex (lowercase)', () => {
      const team = { name: 'Team', color: '#ff0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(true);
    });

    it('should pass when color is valid 6-digit hex (uppercase)', () => {
      const team = { name: 'Team', color: '#FF0000' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(true);
    });

    it('should pass when color is not provided', () => {
      const team = { name: 'Team' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(true);
    });

    it('should collect multiple errors', () => {
      const team = { name: '', color: 'invalid' };
      const result = validateTeam(team);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  // ============================================
  // validatePlayer
  // ============================================
  describe('validatePlayer', () => {
    it('should pass validation for valid player', () => {
      const player = {
        name: 'Lionel Messi',
        nickname: 'Leo',
        jerseyNumber: '10',
        notes: 'Best player',
      };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when player name is missing', () => {
      const player = { jerseyNumber: '10' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Player name is required',
      });
    });

    it('should fail when player name is empty', () => {
      const player = { name: '' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Player name is required',
      });
    });

    it('should fail when player name exceeds 50 characters', () => {
      const player = { name: 'A'.repeat(51) };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'name',
        message: 'Player name must be 50 characters or less',
      });
    });

    it('should fail when nickname exceeds 20 characters', () => {
      const player = { name: 'Player', nickname: 'A'.repeat(21) };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'nickname',
        message: 'Nickname must be 20 characters or less',
      });
    });

    it('should pass when nickname is exactly 20 characters', () => {
      const player = { name: 'Player', nickname: 'A'.repeat(20) };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(true);
    });

    it('should fail when jersey number is negative', () => {
      const player = { name: 'Player', jerseyNumber: '-1' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'jerseyNumber',
        message: 'Jersey number must be a number between 0 and 999',
      });
    });

    it('should fail when jersey number exceeds 999', () => {
      const player = { name: 'Player', jerseyNumber: '1000' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'jerseyNumber',
        message: 'Jersey number must be a number between 0 and 999',
      });
    });

    it('should pass when jersey number is 0', () => {
      const player = { name: 'Player', jerseyNumber: '0' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(true);
    });

    it('should pass when jersey number is 999', () => {
      const player = { name: 'Player', jerseyNumber: '999' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(true);
    });

    it('should fail when jersey number is not a number', () => {
      const player = { name: 'Player', jerseyNumber: 'abc' };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'jerseyNumber',
        message: 'Jersey number must be a number between 0 and 999',
      });
    });

    it('should fail when notes exceed 200 characters', () => {
      const player = { name: 'Player', notes: 'A'.repeat(201) };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'notes',
        message: 'Notes must be 200 characters or less',
      });
    });

    it('should pass when notes are exactly 200 characters', () => {
      const player = { name: 'Player', notes: 'A'.repeat(200) };
      const result = validatePlayer(player);

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================
  // validateRoster
  // ============================================
  describe('validateRoster', () => {
    const createPlayer = (overrides: Partial<TeamPlayer> = {}): TeamPlayer => ({
      id: `player_${Date.now()}_test`,
      name: 'Test Player',
      jerseyNumber: '10',
      position: 'Midfielder',
      ...overrides,
    } as TeamPlayer);

    it('should pass validation for valid roster', () => {
      const roster = [
        createPlayer({ name: 'Player 1', jerseyNumber: '1' }),
        createPlayer({ name: 'Player 2', jerseyNumber: '2' }),
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when roster is not an array', () => {
      const result = validateRoster(null as unknown as TeamPlayer[]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'roster',
        message: 'Roster must be an array',
      });
    });

    it('should detect duplicate player names (case-insensitive)', () => {
      const roster = [
        createPlayer({ name: 'John Doe', jerseyNumber: '1' }),
        createPlayer({ name: 'john doe', jerseyNumber: '2' }),
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate player names'))).toBe(true);
    });

    it('should detect duplicate jersey numbers', () => {
      const roster = [
        createPlayer({ name: 'Player 1', jerseyNumber: '10' }),
        createPlayer({ name: 'Player 2', jerseyNumber: '10' }),
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate jersey numbers'))).toBe(true);
    });

    it('should validate individual players in roster', () => {
      const roster = [
        createPlayer({ name: '', jerseyNumber: '1' }), // Invalid name
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'roster[0].name')).toBe(true);
    });

    it('should pass for empty roster', () => {
      const result = validateRoster([]);

      expect(result.isValid).toBe(true);
    });

    it('should ignore empty jersey numbers when checking duplicates', () => {
      const roster = [
        createPlayer({ name: 'Player 1', jerseyNumber: '' }),
        createPlayer({ name: 'Player 2', jerseyNumber: '' }),
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(true);
    });

    it('should handle names with extra whitespace', () => {
      const roster = [
        createPlayer({ name: '  Player 1  ', jerseyNumber: '1' }),
        createPlayer({ name: 'Player 1', jerseyNumber: '2' }),
      ];
      const result = validateRoster(roster);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate player names'))).toBe(true);
    });
  });

  // ============================================
  // Sanitization functions
  // ============================================
  describe('sanitizeTeamName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeTeamName('  Team Name  ')).toBe('Team Name');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'A'.repeat(60);
      expect(sanitizeTeamName(longName)).toBe('A'.repeat(50));
    });

    it('should handle empty string', () => {
      expect(sanitizeTeamName('')).toBe('');
    });
  });

  describe('sanitizePlayerName', () => {
    it('should trim whitespace', () => {
      expect(sanitizePlayerName('  John Doe  ')).toBe('John Doe');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'A'.repeat(60);
      expect(sanitizePlayerName(longName)).toBe('A'.repeat(50));
    });
  });

  describe('sanitizeNotes', () => {
    it('should trim whitespace', () => {
      expect(sanitizeNotes('  Some notes  ')).toBe('Some notes');
    });

    it('should truncate to 200 characters', () => {
      const longNotes = 'A'.repeat(250);
      expect(sanitizeNotes(longNotes)).toBe('A'.repeat(200));
    });
  });

  // ============================================
  // ID validation
  // ============================================
  describe('isValidTeamId', () => {
    it('should accept valid team ID format', () => {
      expect(isValidTeamId('team_1234567890_abc123')).toBe(true);
    });

    it('should accept uppercase letters in suffix', () => {
      expect(isValidTeamId('team_1234567890_ABC123')).toBe(true);
    });

    it('should reject invalid prefix', () => {
      expect(isValidTeamId('player_1234567890_abc123')).toBe(false);
    });

    it('should reject missing timestamp', () => {
      expect(isValidTeamId('team_abc123')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTeamId('')).toBe(false);
    });

    it('should reject random string', () => {
      expect(isValidTeamId('random-string')).toBe(false);
    });
  });

  describe('isValidPlayerId', () => {
    it('should accept valid player ID format', () => {
      expect(isValidPlayerId('player_1234567890_abc123')).toBe(true);
    });

    it('should accept player ID with optional suffix number', () => {
      expect(isValidPlayerId('player_1234567890_abc123_1')).toBe(true);
    });

    it('should reject invalid prefix', () => {
      expect(isValidPlayerId('team_1234567890_abc123')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidPlayerId('')).toBe(false);
    });
  });

  // ============================================
  // logValidationError
  // ============================================
  describe('logValidationError', () => {
    it('should log errors to logger', () => {
      const errors: ValidationError[] = [
        { field: 'name', message: 'Name is required' },
      ];
      logValidationError('Test context', errors);

      expect(logger.error).toHaveBeenCalledWith('[Validation] Test context:', errors);
    });
  });

  // ============================================
  // validateTeamIntegrity
  // ============================================
  describe('validateTeamIntegrity', () => {
    const createTeam = (overrides: Partial<Team> = {}): Team => ({
      id: 'team_1234567890_abc123',
      name: 'Test Team',
      color: '#FF0000',
      createdAt: Date.now(),
      ...overrides,
    } as Team);

    const createPlayer = (overrides: Partial<TeamPlayer> = {}): TeamPlayer => ({
      id: 'player_1234567890_abc123',
      name: 'Test Player',
      jerseyNumber: '10',
      position: 'Midfielder',
      ...overrides,
    } as TeamPlayer);

    it('should pass for valid team and roster', () => {
      const team = createTeam();
      const roster = [createPlayer()];
      const result = validateTeamIntegrity(team, roster);

      expect(result.isValid).toBe(true);
    });

    it('should fail for invalid team ID', () => {
      const team = createTeam({ id: 'invalid-id' });
      const roster = [createPlayer()];
      const result = validateTeamIntegrity(team, roster);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'id',
        message: 'Invalid team ID format',
      });
    });

    it('should fail for invalid player ID in roster', () => {
      const team = createTeam();
      const roster = [createPlayer({ id: 'invalid-player-id' })];
      const result = validateTeamIntegrity(team, roster);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid player ID format'))).toBe(true);
    });

    it('should fail when roster exceeds 50 players', () => {
      const team = createTeam();
      const roster = Array(51).fill(null).map((_, i) =>
        createPlayer({ id: `player_${Date.now()}_test${i}`, name: `Player ${i}` })
      );
      const result = validateTeamIntegrity(team, roster);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'roster',
        message: 'Team roster cannot exceed 50 players',
      });
    });

    it('should pass when roster has exactly 50 players', () => {
      const team = createTeam();
      const roster = Array(50).fill(null).map((_, i) =>
        createPlayer({ id: `player_${Date.now()}_test${i}`, name: `Player ${i}` })
      );
      const result = validateTeamIntegrity(team, roster);

      expect(result.isValid).toBe(true);
    });
  });
});
