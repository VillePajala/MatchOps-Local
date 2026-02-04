/**
 * Tests for useGameImport hook
 * @integration
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameImport } from '../useGameImport';
import type { GameImportResult } from '@/utils/gameImport';

// Mock the game import utilities
jest.mock('@/utils/gameImport', () => ({
  importGamesWithMapping: jest.fn(),
  importGamesFromFile: jest.fn(),
}));

const {
  importGamesWithMapping,
  importGamesFromFile,
} = jest.requireMock('@/utils/gameImport');

// Mock the logger
jest.mock('@/utils/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createLogger: jest.fn(() => mockLogger),
  };
});

// Mock useDataStore for user-scoped storage
const TEST_USER_ID = 'test-user-123';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: TEST_USER_ID,
    getStore: jest.fn(),
    isUserScoped: true,
  }),
}));

// Test data fixtures
const mockSuccessResult: GameImportResult = {
  success: true,
  successful: 3,
  skipped: 1,
  failed: [],
  warnings: [],
  mappingReport: {
    totalGames: 4,
    gamesWithMappedPlayers: 3,
    totalPlayerMappings: 15,
    exactMatches: 10,
    nameMatches: 5,
    noMatches: 0,
  },
};

const mockPartialSuccessResult: GameImportResult = {
  success: true,
  successful: 2,
  skipped: 0,
  failed: [{ gameId: 'game-3', error: 'Invalid game data' }],
  warnings: ['Some players could not be mapped'],
  mappingReport: {
    totalGames: 3,
    gamesWithMappedPlayers: 2,
    totalPlayerMappings: 10,
    exactMatches: 5,
    nameMatches: 3,
    noMatches: 2,
  },
};

// Helper to create test wrapper with QueryClient
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const createTestWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
};

describe('useGameImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    importGamesWithMapping.mockResolvedValue(mockSuccessResult);
    importGamesFromFile.mockResolvedValue(mockSuccessResult);
  });

  describe('initial state', () => {
    /**
     * Tests initial hook state
     * @critical - Initial state verification
     */
    it('should have correct initial state', () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      expect(result.current.isImporting).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.lastResult).toBeNull();
      expect(typeof result.current.importFromJson).toBe('function');
      expect(typeof result.current.importFromFile).toBe('function');
    });
  });

  describe('importFromJson', () => {
    /**
     * Tests successful JSON import
     * @critical - Core import functionality
     */
    it('should import games from JSON successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      const jsonData = '{"game1": {"id": "game1", "gameName": "Test Game"}}';

      let importResult: GameImportResult | null = null;
      await act(async () => {
        importResult = await result.current.importFromJson(jsonData);
      });

      expect(importResult).toEqual(mockSuccessResult);
      expect(importGamesWithMapping).toHaveBeenCalledWith(
        jsonData,
        false,
        expect.any(Function),
        TEST_USER_ID
      );
    });

    /**
     * Tests JSON import with overwrite flag
     * @integration - Overwrite mode
     */
    it('should pass overwrite flag to import function', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      const jsonData = '{"game1": {}}';

      await act(async () => {
        await result.current.importFromJson(jsonData, true);
      });

      expect(importGamesWithMapping).toHaveBeenCalledWith(
        jsonData,
        true,
        expect.any(Function),
        TEST_USER_ID
      );
    });

    /**
     * Tests JSON import with partial success
     * @edge-case - Some games fail to import
     */
    it('should handle partial success with warnings', async () => {
      importGamesWithMapping.mockResolvedValue(mockPartialSuccessResult);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      let importResult: GameImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importFromJson('{}');
      });

      expect(importResult).toBeDefined();
      expect(importResult!.success).toBe(true);
      expect(importResult!.successful).toBe(2);
      expect(importResult!.failed).toHaveLength(1);
      expect(importResult!.warnings).toContain('Some players could not be mapped');
    });

    /**
     * Tests JSON import failure
     * @edge-case - Import fails completely
     */
    it('should handle import failure', async () => {
      const error = new Error('Import failed');
      importGamesWithMapping.mockRejectedValue(error);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      await expect(
        act(async () => {
          await result.current.importFromJson('invalid json');
        })
      ).rejects.toThrow('Import failed');
    });
  });

  describe('importFromFile', () => {
    /**
     * Tests successful file import
     * @critical - File import functionality
     */
    it('should import games from file successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      const mockFile = new File(['{}'], 'games.json', { type: 'application/json' });

      let importResult: GameImportResult | null = null;
      await act(async () => {
        importResult = await result.current.importFromFile(mockFile);
      });

      expect(importResult).toEqual(mockSuccessResult);
      expect(importGamesFromFile).toHaveBeenCalledWith(
        mockFile,
        false,
        expect.any(Function),
        TEST_USER_ID
      );
      // Wait for state update to propagate
      await waitFor(() => {
        expect(result.current.lastResult).toEqual(mockSuccessResult);
      });
    });

    /**
     * Tests file import with overwrite flag
     * @integration - Overwrite mode
     */
    it('should pass overwrite flag to file import function', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      const mockFile = new File(['{}'], 'games.json', { type: 'application/json' });

      await act(async () => {
        await result.current.importFromFile(mockFile, true);
      });

      expect(importGamesFromFile).toHaveBeenCalledWith(
        mockFile,
        true,
        expect.any(Function),
        TEST_USER_ID
      );
    });

    /**
     * Tests file import failure
     * @edge-case - File import fails
     */
    it('should handle file import failure', async () => {
      const error = new Error('File read failed');
      importGamesFromFile.mockRejectedValue(error);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      const mockFile = new File(['invalid'], 'bad.json', { type: 'application/json' });

      await expect(
        act(async () => {
          await result.current.importFromFile(mockFile);
        })
      ).rejects.toThrow('File read failed');
    });
  });

  describe('lastResult tracking', () => {
    /**
     * Tests that lastResult is updated after successful import
     * @integration - Result tracking
     */
    it('should update lastResult after successful JSON import', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      expect(result.current.lastResult).toBeNull();

      await act(async () => {
        await result.current.importFromJson('{}');
      });

      // Wait for state update to propagate
      await waitFor(() => {
        expect(result.current.lastResult).toEqual(mockSuccessResult);
      });
    });

    /**
     * Tests that lastResult is updated after file import
     * @integration - Result tracking
     */
    it('should update lastResult after successful file import', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      expect(result.current.lastResult).toBeNull();

      const mockFile = new File(['{}'], 'games.json', { type: 'application/json' });

      await act(async () => {
        await result.current.importFromFile(mockFile);
      });

      // Wait for state update to propagate
      await waitFor(() => {
        expect(result.current.lastResult).toEqual(mockSuccessResult);
      });
    });
  });

  describe('mapping report', () => {
    /**
     * Tests that mapping report is included in result
     * @integration - Mapping statistics
     */
    it('should include mapping report in import result', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useGameImport(), { wrapper });

      let importResult: GameImportResult | undefined;
      await act(async () => {
        importResult = await result.current.importFromJson('{}');
      });

      expect(importResult).toBeDefined();
      expect(importResult!.mappingReport).toBeDefined();
      expect(importResult!.mappingReport!.totalGames).toBe(4);
      expect(importResult!.mappingReport!.exactMatches).toBe(10);
      expect(importResult!.mappingReport!.nameMatches).toBe(5);
    });
  });
});
