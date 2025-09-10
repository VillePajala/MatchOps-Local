'use client';

import { Team, TeamPlayer } from '@/types';
import logger from '@/utils/logger';

// Validation utilities for team management

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Team validation
export const validateTeam = (team: Partial<Team>): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!team.name || team.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Team name is required' });
  } else if (team.name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Team name must be 50 characters or less' });
  }

  if (team.color && !/^#[0-9A-F]{6}$/i.test(team.color)) {
    errors.push({ field: 'color', message: 'Team color must be a valid hex color' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Player validation
export const validatePlayer = (player: Partial<TeamPlayer>): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!player.name || player.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Player name is required' });
  } else if (player.name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Player name must be 50 characters or less' });
  }

  if (player.nickname && player.nickname.length > 20) {
    errors.push({ field: 'nickname', message: 'Nickname must be 20 characters or less' });
  }

  if (player.jerseyNumber && (isNaN(Number(player.jerseyNumber)) || Number(player.jerseyNumber) < 0 || Number(player.jerseyNumber) > 999)) {
    errors.push({ field: 'jerseyNumber', message: 'Jersey number must be a number between 0 and 999' });
  }

  if (player.notes && player.notes.length > 200) {
    errors.push({ field: 'notes', message: 'Notes must be 200 characters or less' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Roster validation
export const validateRoster = (roster: TeamPlayer[]): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!Array.isArray(roster)) {
    errors.push({ field: 'roster', message: 'Roster must be an array' });
    return { isValid: false, errors };
  }

  // Check for duplicate names
  const names = roster.map(p => p.name.toLowerCase().trim());
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    errors.push({ field: 'roster', message: `Duplicate player names found: ${duplicateNames.join(', ')}` });
  }

  // Check for duplicate jersey numbers
  const jerseyNumbers = roster
    .map(p => p.jerseyNumber)
    .filter(num => num && !isNaN(Number(num)))
    .map(num => Number(num));
  const duplicateNumbers = jerseyNumbers.filter((num, index) => jerseyNumbers.indexOf(num) !== index);
  if (duplicateNumbers.length > 0) {
    errors.push({ field: 'roster', message: `Duplicate jersey numbers found: ${duplicateNumbers.join(', ')}` });
  }

  // Validate each player
  roster.forEach((player, index) => {
    const playerValidation = validatePlayer(player);
    if (!playerValidation.isValid) {
      playerValidation.errors.forEach(error => {
        errors.push({ 
          field: `roster[${index}].${error.field}`, 
          message: `Player ${index + 1}: ${error.message}` 
        });
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Safe data sanitization
export const sanitizeTeamName = (name: string): string => {
  return name.trim().substring(0, 50);
};

export const sanitizePlayerName = (name: string): string => {
  return name.trim().substring(0, 50);
};

export const sanitizeNotes = (notes: string): string => {
  return notes.trim().substring(0, 200);
};

// Error logging helper
export const logValidationError = (context: string, errors: ValidationError[]): void => {
  logger.error(`[Validation] ${context}`, new Error(errors.map(e => `${e.field}: ${e.message}`).join(', ')), { component: 'validation', section: 'logValidationError' });
};

// Safe ID validation
export const isValidTeamId = (id: string): boolean => {
  return /^team_\d+_[a-z0-9]+$/i.test(id);
};

export const isValidPlayerId = (id: string): boolean => {
  return /^player_\d+_[a-z0-9]+(_\d+)?$/i.test(id);
};

// Data integrity checks
export const validateTeamIntegrity = (team: Team, roster: TeamPlayer[]): ValidationResult => {
  const errors: ValidationError[] = [];

  // Check if team ID is valid
  if (!isValidTeamId(team.id)) {
    errors.push({ field: 'id', message: 'Invalid team ID format' });
  }

  // Check if all player IDs are valid
  roster.forEach((player, index) => {
    if (!isValidPlayerId(player.id)) {
      errors.push({ field: `roster[${index}].id`, message: `Invalid player ID format: ${player.id}` });
    }
  });

  // Check if team has reasonable roster size
  if (roster.length > 50) {
    errors.push({ field: 'roster', message: 'Team roster cannot exceed 50 players' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};