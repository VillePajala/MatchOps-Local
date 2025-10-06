/**
 * Error Test Fixtures
 *
 * Centralized error scenarios and edge cases for robust error testing.
 */

/**
 * Storage-related errors
 */
export const storage = {
  /**
   * Creates a storage quota exceeded error
   */
  quotaExceeded: () => new DOMException('QuotaExceededError', 'QuotaExceededError'),

  /**
   * Creates a storage not available error
   */
  notAvailable: () => new Error('Storage is not available'),

  /**
   * Creates corrupted data scenario
   */
  corruptedData: () => ({
    invalidJson: '{"invalid": json}',
    missingFields: '{"incomplete": "data"}',
    wrongType: '42', // Number instead of object
  }),
};

/**
 * Network-related errors
 */
export const network = {
  /**
   * Creates a network timeout error
   */
  timeout: () => new Error('Network timeout'),

  /**
   * Creates a connection refused error
   */
  connectionRefused: () => new Error('ECONNREFUSED'),

  /**
   * Creates offline scenario
   */
  offline: () => new Error('Network unavailable'),
};

/**
 * Validation errors
 */
export const validation = {
  /**
   * Creates invalid player data
   */
  invalidPlayer: () => ({
    missingId: { name: 'Player', jerseyNumber: '10' },
    missingName: { id: 'player_1', jerseyNumber: '10' },
    invalidPosition: { id: 'player_1', name: 'Player', relX: -1, relY: 2 },
  }),

  /**
   * Creates invalid game state
   */
  invalidGameState: () => ({
    missingTeamName: { opponentName: 'Opponent', homeScore: 0 },
    negativeScore: { teamName: 'Team', homeScore: -1, awayScore: 0 },
    invalidStatus: { teamName: 'Team', gameStatus: 'invalid' as any },
  }),
};

/**
 * Browser compatibility issues
 */
export const browser = {
  /**
   * Missing localStorage support
   */
  noLocalStorage: () => {
    const error = new Error('localStorage is not supported');
    error.name = 'NotSupportedError';
    return error;
  },

  /**
   * Missing IndexedDB support
   */
  noIndexedDB: () => {
    const error = new Error('IndexedDB is not supported');
    error.name = 'NotSupportedError';
    return error;
  },
};

/**
 * Performance-related scenarios
 */
export const performance = {
  /**
   * Creates large dataset that might cause memory issues
   */
  largeDataset: (size: number = 10000) => Array.from({ length: size }, (_, i) => ({
    id: `item_${i}`,
    data: `Large data payload ${i}`.repeat(100),
  })),

  /**
   * Creates memory pressure scenario
   */
  memoryPressure: () => ({
    usedJSHeapSize: 1900000000, // Close to 2GB limit
    totalJSHeapSize: 2000000000,
    jsHeapSizeLimit: 2147483648,
  }),
};