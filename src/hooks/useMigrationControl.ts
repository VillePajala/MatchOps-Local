/**
 * React Hook for Migration Control
 *
 * Provides easy integration of migration control features in React components
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MigrationControlManager } from '@/utils/migrationControlManager';
import {
  MigrationControl,
  MigrationEstimation,
  MigrationPreview,
  MigrationCancellation
} from '@/types/migrationControl';
import logger from '@/utils/logger';

export interface UseMigrationControlOptions {
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: (cancellation: MigrationCancellation) => void;
  onEstimation?: (estimation: MigrationEstimation) => void;
  onPreview?: (preview: MigrationPreview) => void;
}

export interface UseMigrationControlReturn {
  // State
  control: MigrationControl;
  estimation: MigrationEstimation | null;
  preview: MigrationPreview | null;
  isEstimating: boolean;
  isPreviewing: boolean;

  // Actions
  pauseMigration: () => Promise<void>;
  resumeMigration: () => Promise<void>;
  cancelMigration: () => Promise<void>;
  estimateMigration: (keys: string[]) => Promise<void>;
  previewMigration: (keys: string[]) => Promise<void>;
  resetControl: () => void;

  // Control manager instance
  controlManager: MigrationControlManager | null;
}

export function useMigrationControl(
  options: UseMigrationControlOptions = {}
): UseMigrationControlReturn {
  const [control, setControl] = useState<MigrationControl>({
    canPause: false,
    canCancel: false,
    canResume: false,
    isPaused: false,
    isCancelling: false
  });

  const [estimation, setEstimation] = useState<MigrationEstimation | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const controlManagerRef = useRef<MigrationControlManager | null>(null);
  const isMountedRef = useRef(true);

  // Stabilize callbacks to prevent unnecessary recreation
  const stableCallbacks = useRef(options);
  stableCallbacks.current = options;

  // Initialize control manager
  useEffect(() => {
    const manager = new MigrationControlManager({
      onPause: () => {
        if (!isMountedRef.current) return;
        logger.log('Migration paused via hook');
        setControl(prev => ({ ...prev, isPaused: true, canResume: true }));
        stableCallbacks.current.onPause?.();
      },
      onResume: () => {
        if (!isMountedRef.current) return;
        logger.log('Migration resumed via hook');
        setControl(prev => ({ ...prev, isPaused: false, canResume: false }));
        stableCallbacks.current.onResume?.();
      },
      onCancel: (cancellation) => {
        if (!isMountedRef.current) return;
        logger.log('Migration cancelled via hook', cancellation);
        setControl(prev => ({ ...prev, isCancelling: false }));
        stableCallbacks.current.onCancel?.(cancellation);
      },
      onEstimation: (est) => {
        if (!isMountedRef.current) return;
        logger.log('Migration estimation received', est);
        setEstimation(est);
        setIsEstimating(false);
        stableCallbacks.current.onEstimation?.(est);
      },
      onPreview: (prev) => {
        if (!isMountedRef.current) return;
        logger.log('Migration preview received', prev);
        setPreview(prev);
        setIsPreviewing(false);
        stableCallbacks.current.onPreview?.(prev);
      }
    });

    controlManagerRef.current = manager;

    // Load initial control state
    const initialState = manager.getControlState();
    setControl(initialState);

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      manager.cleanup();
    };
  }, []); // Empty dependency array - manager is created only once

  // Pause migration
  const pauseMigration = useCallback(async () => {
    if (!controlManagerRef.current) return;

    try {
      logger.log('Requesting migration pause');
      await controlManagerRef.current.requestPause();
      if (isMountedRef.current) {
        setControl(prev => ({ ...prev, isPaused: true }));
      }
    } catch (error) {
      logger.error('Failed to pause migration', error);
    }
  }, []);

  // Resume migration
  const resumeMigration = useCallback(async () => {
    if (!controlManagerRef.current) return;

    try {
      logger.log('Requesting migration resume');
      const resumeData = await controlManagerRef.current.requestResume();
      if (resumeData && isMountedRef.current) {
        setControl(prev => ({
          ...prev,
          isPaused: false,
          canResume: false,
          resumeData: undefined
        }));
      }
    } catch (error) {
      logger.error('Failed to resume migration', error);
    }
  }, []);

  // Cancel migration
  const cancelMigration = useCallback(async () => {
    if (!controlManagerRef.current) return;

    try {
      logger.log('Requesting migration cancellation');
      if (isMountedRef.current) {
        setControl(prev => ({ ...prev, isCancelling: true }));
      }
      await controlManagerRef.current.requestCancel();
    } catch (error) {
      logger.error('Failed to cancel migration', error);
      if (isMountedRef.current) {
        setControl(prev => ({ ...prev, isCancelling: false }));
      }
    }
  }, []);

  // Estimate migration
  const estimateMigration = useCallback(async (keys: string[]) => {
    if (!controlManagerRef.current || isEstimating) return;

    try {
      setIsEstimating(true);
      logger.log('Starting migration estimation', { keyCount: keys.length });
      const est = await controlManagerRef.current.estimateMigration(keys);
      if (isMountedRef.current) {
        setEstimation(est);
      }
    } catch (error) {
      logger.error('Failed to estimate migration', error);
    } finally {
      if (isMountedRef.current) {
        setIsEstimating(false);
      }
    }
  }, [isEstimating]);

  // Preview migration
  const previewMigration = useCallback(async (keys: string[]) => {
    if (!controlManagerRef.current || isPreviewing) return;

    try {
      setIsPreviewing(true);
      logger.log('Starting migration preview', { keyCount: keys.length });
      const prev = await controlManagerRef.current.previewMigration(keys);
      if (isMountedRef.current) {
        setPreview(prev);
      }
    } catch (error) {
      logger.error('Failed to preview migration', error);
    } finally {
      if (isMountedRef.current) {
        setIsPreviewing(false);
      }
    }
  }, [isPreviewing]);

  // Reset control state
  const resetControl = useCallback(() => {
    setControl({
      canPause: false,
      canCancel: false,
      canResume: false,
      isPaused: false,
      isCancelling: false
    });
    setEstimation(null);
    setPreview(null);
    setIsEstimating(false);
    setIsPreviewing(false);
  }, []);

  return {
    // State
    control,
    estimation,
    preview,
    isEstimating,
    isPreviewing,

    // Actions
    pauseMigration,
    resumeMigration,
    cancelMigration,
    estimateMigration,
    previewMigration,
    resetControl,

    // Manager instance
    controlManager: controlManagerRef.current
  };
}