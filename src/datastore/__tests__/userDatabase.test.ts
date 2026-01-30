/**
 * Tests for user-scoped database naming utilities.
 */

import {
  getUserDatabaseName,
  isUserScopedDatabase,
  extractUserIdFromDatabaseName,
  LEGACY_DATABASE_NAME,
  validateUserId,
  MAX_USER_ID_LENGTH,
} from '../userDatabase';

describe('userDatabase', () => {
  describe('getUserDatabaseName', () => {
    it('should generate correct database name for valid userId', () => {
      expect(getUserDatabaseName('user-123')).toBe('matchops_user_user-123');
      expect(getUserDatabaseName('abc_456')).toBe('matchops_user_abc_456');
      expect(getUserDatabaseName('ABC123')).toBe('matchops_user_ABC123');
    });

    it('should trim whitespace from userId', () => {
      expect(getUserDatabaseName('  user-123  ')).toBe('matchops_user_user-123');
    });

    it('should throw on empty userId', () => {
      expect(() => getUserDatabaseName('')).toThrow('userId is required');
    });

    it('should throw on whitespace-only userId', () => {
      expect(() => getUserDatabaseName('   ')).toThrow('userId cannot be empty');
    });

    it('should throw on invalid characters', () => {
      expect(() => getUserDatabaseName('user@email.com')).toThrow('invalid characters');
      expect(() => getUserDatabaseName('user/path')).toThrow('invalid characters');
      expect(() => getUserDatabaseName('user..name')).toThrow('invalid characters');
    });

    it('should throw on userId exceeding max length', () => {
      const longUserId = 'a'.repeat(256);
      expect(() => getUserDatabaseName(longUserId)).toThrow('exceeds maximum length');
    });

    it('should accept userId at max length', () => {
      const maxUserId = 'a'.repeat(255);
      expect(getUserDatabaseName(maxUserId)).toBe(`matchops_user_${maxUserId}`);
    });

    // Boundary tests for edge cases
    it('should accept exactly 255 characters (boundary)', () => {
      const exactMax = 'a'.repeat(MAX_USER_ID_LENGTH);
      expect(exactMax.length).toBe(255);
      expect(() => getUserDatabaseName(exactMax)).not.toThrow();
    });

    it('should reject exactly 256 characters (boundary + 1)', () => {
      const overMax = 'a'.repeat(MAX_USER_ID_LENGTH + 1);
      expect(overMax.length).toBe(256);
      expect(() => getUserDatabaseName(overMax)).toThrow('exceeds maximum length');
    });

    it('should handle UUID format with mixed case', () => {
      // Supabase UUIDs can have mixed case
      const mixedCaseUuid = 'f47Ac10B-58cC-4372-a567-0e02B2c3D479';
      expect(getUserDatabaseName(mixedCaseUuid)).toBe(`matchops_user_${mixedCaseUuid}`);
    });

    it('should handle multiple consecutive hyphens', () => {
      expect(getUserDatabaseName('user--name')).toBe('matchops_user_user--name');
      expect(getUserDatabaseName('a---b')).toBe('matchops_user_a---b');
    });

    it('should handle multiple consecutive underscores', () => {
      expect(getUserDatabaseName('user__name')).toBe('matchops_user_user__name');
      expect(getUserDatabaseName('a___b')).toBe('matchops_user_a___b');
    });

    it('should handle mixed consecutive hyphens and underscores', () => {
      expect(getUserDatabaseName('user-_-name')).toBe('matchops_user_user-_-name');
      expect(getUserDatabaseName('a_-_b')).toBe('matchops_user_a_-_b');
    });

    it('should handle single character userId', () => {
      expect(getUserDatabaseName('a')).toBe('matchops_user_a');
      expect(getUserDatabaseName('1')).toBe('matchops_user_1');
    });
  });

  describe('isUserScopedDatabase', () => {
    it('should return true for user-scoped database names', () => {
      expect(isUserScopedDatabase('matchops_user_123')).toBe(true);
      expect(isUserScopedDatabase('matchops_user_abc-def')).toBe(true);
    });

    it('should return false for legacy database name', () => {
      expect(isUserScopedDatabase(LEGACY_DATABASE_NAME)).toBe(false);
    });

    it('should return false for other database names', () => {
      expect(isUserScopedDatabase('other_database')).toBe(false);
      expect(isUserScopedDatabase('')).toBe(false);
    });
  });

  describe('extractUserIdFromDatabaseName', () => {
    it('should extract userId from user-scoped database name', () => {
      expect(extractUserIdFromDatabaseName('matchops_user_123')).toBe('123');
      expect(extractUserIdFromDatabaseName('matchops_user_abc-def')).toBe('abc-def');
    });

    it('should return null for non-user-scoped database names', () => {
      expect(extractUserIdFromDatabaseName(LEGACY_DATABASE_NAME)).toBeNull();
      expect(extractUserIdFromDatabaseName('other_database')).toBeNull();
    });
  });

  describe('LEGACY_DATABASE_NAME', () => {
    it('should be the correct legacy name', () => {
      expect(LEGACY_DATABASE_NAME).toBe('MatchOpsLocal');
    });
  });

  describe('validateUserId', () => {
    it('should return valid result for valid userId', () => {
      const result = validateUserId('user-123');
      expect(result.valid).toBe(true);
      expect(result.trimmedId).toBe('user-123');
      expect(result.error).toBeUndefined();
    });

    it('should trim whitespace and return trimmed id', () => {
      const result = validateUserId('  user-123  ');
      expect(result.valid).toBe(true);
      expect(result.trimmedId).toBe('user-123');
    });

    it('should reject null', () => {
      const result = validateUserId(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject undefined', () => {
      const result = validateUserId(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject empty string', () => {
      const result = validateUserId('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject whitespace-only string', () => {
      const result = validateUserId('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject userId exceeding max length (ReDoS prevention)', () => {
      // Length check happens BEFORE regex to prevent ReDoS
      const longUserId = 'a'.repeat(256);
      const result = validateUserId(longUserId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject invalid characters', () => {
      const result = validateUserId('user@email.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should accept valid UUID format', () => {
      const result = validateUserId('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      expect(result.valid).toBe(true);
      expect(result.trimmedId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });
  });

  describe('MAX_USER_ID_LENGTH', () => {
    it('should be 255', () => {
      expect(MAX_USER_ID_LENGTH).toBe(255);
    });
  });
});
