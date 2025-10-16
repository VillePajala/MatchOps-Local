import { generatePlayerId, generatePlayerIds } from './idGenerator';

describe('idGenerator', () => {
  describe('generatePlayerId', () => {
    /**
     * @critical - Ensures player ID generation produces unique identifiers
     */
    test('should generate a unique player ID with correct format', () => {
      const id = generatePlayerId(0);

      // Check format: player_{timestamp}_{random}_{index}
      expect(id).toMatch(/^player_\d+_[a-z0-9]{9}_0$/);
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

      expect(id1).toMatch(/^player_\d+_[a-z0-9]{9}_0$/);
      expect(id2).toMatch(/^player_\d+_[a-z0-9]{9}_9007199254740991$/);
      expect(id3).toMatch(/^player_\d+_[a-z0-9]{9}_-1$/);
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
        expect(id).toMatch(/^player_\d+_[a-z0-9]{9}_\d+$/);
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
      expect(ids[0]).toMatch(/^player_\d+_[a-z0-9]{9}_0$/);
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

      // All IDs should be valid
      rosterIds.forEach((id, index) => {
        expect(id).toMatch(/^player_\d+_[a-z0-9]{9}_\d+$/);
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

      // Both should match the same format pattern
      const pattern = /^player_\d+_[a-z0-9]{9}_\d+$/;
      expect(singleId).toMatch(pattern);
      expect(batchIds[0]).toMatch(pattern);
    });
  });
});
