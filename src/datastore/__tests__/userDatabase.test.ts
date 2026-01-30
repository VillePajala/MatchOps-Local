/**
 * Tests for user-scoped database naming utilities.
 */

import {
  getUserDatabaseName,
  isUserScopedDatabase,
  extractUserIdFromDatabaseName,
  LEGACY_DATABASE_NAME,
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
});
