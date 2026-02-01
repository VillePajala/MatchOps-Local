import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importGamesWithMapping, importGamesFromFile, GameImportResult } from '@/utils/gameImport';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import logger from '@/utils/logger';

export interface UseGameImportResult {
  importFromJson: (jsonData: string, overwrite?: boolean) => Promise<GameImportResult>;
  importFromFile: (file: File, overwrite?: boolean) => Promise<GameImportResult>;
  isImporting: boolean;
  error: Error | null;
  lastResult: GameImportResult | null;
}

/**
 * React Query hook for importing games with proper cache invalidation
 * This ensures that performance graphs and stats update immediately after import
 */
export const useGameImport = (): UseGameImportResult => {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  const invalidateAllQueries = () => {
    // Invalidate all game-related queries to ensure UI updates (user-scoped)
    queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
    queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] });
    queryClient.invalidateQueries({ queryKey: [...queryKeys.seasons, userId] });
    queryClient.invalidateQueries({ queryKey: [...queryKeys.tournaments, userId] });

    // Also invalidate any team-related queries if they exist
    queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });

    logger.log('Invalidated React Query caches after game import');
  };

  const importJsonMutation = useMutation<
    GameImportResult,
    Error,
    { jsonData: string; overwrite: boolean }
  >({
    mutationFn: async ({ jsonData, overwrite }) => {
      return importGamesWithMapping(jsonData, overwrite, invalidateAllQueries, userId);
    },
    onSuccess: (result) => {
      logger.log('Game import mutation completed:', result);
    },
    onError: (error) => {
      logger.error('Game import mutation failed:', error);
    }
  });

  const importFileMutation = useMutation<
    GameImportResult,
    Error,
    { file: File; overwrite: boolean }
  >({
    mutationFn: async ({ file, overwrite }) => {
      return importGamesFromFile(file, overwrite, invalidateAllQueries, userId);
    },
    onSuccess: (result) => {
      logger.log('Game file import mutation completed:', result);
    },
    onError: (error) => {
      logger.error('Game file import mutation failed:', error);
    }
  });

  return {
    importFromJson: (jsonData: string, overwrite = false) =>
      importJsonMutation.mutateAsync({ jsonData, overwrite }),
    
    importFromFile: (file: File, overwrite = false) =>
      importFileMutation.mutateAsync({ file, overwrite }),
    
    isImporting: importJsonMutation.isPending || importFileMutation.isPending,
    
    error: importJsonMutation.error || importFileMutation.error || null,
    
    lastResult: importJsonMutation.data || importFileMutation.data || null,
  };
};