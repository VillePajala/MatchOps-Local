import { generateId, generatePlayerId, generatePlayerIds } from './idGenerator';

describe('idGenerator', () => {
  describe('generatePlayerId', () => {
    /**
     * @critical - Ensures player ID generation produces unique identifiers
     */
    test('should generate a unique player ID with correct format', () => {
      const id = generatePlayerId(0);

      // Check format: player_{timestamp}_{random}_{index}
      expect(id).toMatch(/^player_\d+_[a-z0-9]{8,9}_0$/);
    });

    test('should include the provided index in the ID', () => {
      const id1 = generatePlayerId(0);
      const id2 = generatePlayerId(5);
      const id3 = generatePlayerId(99);

      expect(id1).toMatch(/_0$/);
      expect(id2).toMatch(/_5$/);
      expect(id3).toMatch(/_99$/);
    });

    test('should use default index of 0 when no index provided', () => {
      const id = generatePlayerId();

      expect(id).toMatch(/_0$/);
    });

    test('should generate different IDs for consecutive calls', () => {
      const id1 = generatePlayerId(0);
      const id2 = generatePlayerId(0);

      // Random parts should differ
      expect(id1).not.toBe(id2);
    });

    test('should generate IDs with timestamp component', () => {
      const beforeTimestamp = Date.now();
      const id = generatePlayerId(0);
      const afterTimestamp = Date.now();

      // Extract timestamp from ID (format: player_{timestamp}_{random}_{index})
      const timestampMatch = id.match(/^player_(\d+)_/);
      expect(timestampMatch).not.toBeNull();

      const extractedTimestamp = parseInt(timestampMatch![1], 10);
      expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(extractedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    test('should generate IDs with 9-character random component', () => {
      const id = generatePlayerId(0);

      // Extract random part (format: player_{timestamp}_{random}_{index})
      const randomMatch = id.match(/^player_\d+_([a-z0-9]+)_\d+$/);
      expect(randomMatch).not.toBeNull();
      expect(randomMatch![1]).toHaveLength(9);
    });

    /**
     * @edge-case - Tests boundary values for index parameter
     */
    test('should handle edge case index values', () => {
      const id1 = generatePlayerId(0);
      const id2 = generatePlayerId(Number.MAX_SAFE_INTEGER);
      const id3 = generatePlayerId(-1);

      expect(id1).toMatch(/^player_\d+_[a-z0-9]{8,9}_0$/);
      expect(id2).toMatch(/^player_\d+_[a-z0-9]{8,9}_9007199254740991$/);
      expect(id3).toMatch(/^player_\d+_[a-z0-9]{8,9}_-1$/);
    });
  });

  describe('generatePlayerIds', () => {
    /**
     * @critical - Tests batch player ID generation for roster operations
     */
    test('should generate array of unique IDs with correct count', () => {
      const ids = generatePlayerIds(5);

      expect(ids).toHaveLength(5);

      // All IDs should have correct format
      ids.forEach(id => {
        expect(id).toMatch(/^player_\d+_[a-z0-9]{8,9}_\d+$/);
      });
    });

    test('should generate IDs with sequential indices', () => {
      const ids = generatePlayerIds(3);

      expect(ids[0]).toMatch(/_0$/);
      expect(ids[1]).toMatch(/_1$/);
      expect(ids[2]).toMatch(/_2$/);
    });

    test('should generate all unique IDs', () => {
      const ids = generatePlayerIds(10);
      const uniqueIds = new Set(ids);

      // All IDs should be unique
      expect(uniqueIds.size).toBe(10);
    });

    test('should share same timestamp for all IDs in batch', () => {
      const ids = generatePlayerIds(5);

      // Extract timestamps from all IDs
      const timestamps = ids.map(id => {
        const match = id.match(/^player_(\d+)_/);
        return match ? match[1] : null;
      });

      // All timestamps should be the same (generated in same batch)
      const uniqueTimestamps = new Set(timestamps);
      expect(uniqueTimestamps.size).toBe(1);
    });

    test('should handle empty array request', () => {
      const ids = generatePlayerIds(0);

      expect(ids).toEqual([]);
      expect(ids).toHaveLength(0);
    });

    test('should handle single ID request', () => {
      const ids = generatePlayerIds(1);

      expect(ids).toHaveLength(1);
      expect(ids[0]).toMatch(/^player_\d+_[a-z0-9]{8,9}_0$/);
    });

    /**
     * @performance - Ensures batch generation is efficient for large rosters
     */
    test('should efficiently generate large batches', () => {
      const startTime = Date.now();
      const ids = generatePlayerIds(100);
      const duration = Date.now() - startTime;

      expect(ids).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms

      // Verify all unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    test('should use different random components for each ID in batch', () => {
      const ids = generatePlayerIds(5);

      // Extract random parts
      const randomParts = ids.map(id => {
        const match = id.match(/^player_\d+_([a-z0-9]+)_\d+$/);
        return match ? match[1] : null;
      });

      // All random parts should be different
      const uniqueRandomParts = new Set(randomParts);
      expect(uniqueRandomParts.size).toBe(5);
    });

    /**
     * @integration - Tests realistic usage pattern for team roster management
     */
    test('should generate IDs suitable for team roster operations', () => {
      // Simulate creating a roster of 20 players
      const rosterIds = generatePlayerIds(20);

      // All IDs should be unique
      expect(new Set(rosterIds).size).toBe(20);

      // All IDs should be valid (random part can be 8-9 chars due to Math.random behavior)
      rosterIds.forEach((id, index) => {
        expect(id).toMatch(/^player_\d+_[a-z0-9]{8,9}_\d+$/);
        expect(id).toContain(`_${index}`);
      });
    });
  });

  describe('consistency between functions', () => {
    /**
     * @integration - Ensures generatePlayerId and generatePlayerIds produce compatible IDs
     */
    test('should produce compatible ID formats', () => {
      const singleId = generatePlayerId(0);
      const batchIds = generatePlayerIds(1);

      // Both should match the same format pattern (random part can be 8-9 chars)
      const pattern = /^player_\d+_[a-z0-9]{8,9}_\d+$/;
      expect(singleId).toMatch(pattern);
      expect(batchIds[0]).toMatch(pattern);
    });
  });

  describe('generateId', () => {
    /**
     * @critical - Ensures generic ID generation produces unique identifiers
     */
    test('should generate ID with correct format for any prefix', () => {
      const playerId = generateId('player');
      const teamId = generateId('team');
      const seasonId = generateId('season');
      const tournamentId = generateId('tournament');

      // Format: {prefix}_{timestamp}_{random} where random is 8 hex/alphanumeric chars
      expect(playerId).toMatch(/^player_\d+_[a-f0-9]{8}$/);
      expect(teamId).toMatch(/^team_\d+_[a-f0-9]{8}$/);
      expect(seasonId).toMatch(/^season_\d+_[a-f0-9]{8}$/);
      expect(tournamentId).toMatch(/^tournament_\d+_[a-f0-9]{8}$/);
    });

    test('should generate unique IDs for consecutive calls', () => {
      const id1 = generateId('test');
      const id2 = generateId('test');
      const id3 = generateId('test');

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    test('should include timestamp component', () => {
      const beforeTimestamp = Date.now();
      const id = generateId('test');
      const afterTimestamp = Date.now();

      // Extract timestamp from ID (format: prefix_{timestamp}_{random})
      const timestampMatch = id.match(/^test_(\d+)_/);
      expect(timestampMatch).not.toBeNull();

      const extractedTimestamp = parseInt(timestampMatch![1], 10);
      expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(extractedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    test('should generate 8-character random component', () => {
      const id = generateId('test');

      // Extract random part (format: prefix_{timestamp}_{random})
      const randomMatch = id.match(/^test_\d+_([a-f0-9]+)$/);
      expect(randomMatch).not.toBeNull();
      expect(randomMatch![1]).toHaveLength(8);
    });

    /**
     * @edge-case - Tests various prefix types
     */
    test('should handle different prefix formats', () => {
      const shortPrefix = generateId('x');
      const longPrefix = generateId('very_long_prefix');
      const numericPrefix = generateId('123');

      expect(shortPrefix).toMatch(/^x_\d+_[a-f0-9]{8}$/);
      expect(longPrefix).toMatch(/^very_long_prefix_\d+_[a-f0-9]{8}$/);
      expect(numericPrefix).toMatch(/^123_\d+_[a-f0-9]{8}$/);
    });

    /**
     * @performance - Ensures ID generation is efficient
     */
    test('should efficiently generate many IDs', () => {
      const startTime = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateId('perf'));
      }
      const duration = Date.now() - startTime;

      expect(ids).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms

      // Verify all unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });
});
