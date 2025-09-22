/**
 * Migration Control Types (Phase 2.1)
 *
 * Type definitions for pause/resume, cancellation, and estimation features
 */

export interface MigrationControl {
  // Control state
  canPause: boolean;
  canCancel: boolean;
  canResume: boolean;
  isPaused: boolean;
  isCancelling: boolean;

  // Resume data
  resumeData?: MigrationResumeData;

  // Estimation data
  estimation?: MigrationEstimation;
}

export interface MigrationResumeData {
  // Where we left off
  lastProcessedKey: string;
  processedKeys: string[];
  remainingKeys: string[];

  // Progress snapshot
  itemsProcessed: number;
  totalItems: number;
  bytesProcessed: number;
  totalBytes: number;

  // Checkpoint data
  checkpointId: string;
  checkpointTimestamp: number;

  // Session info
  sessionId: string;
  startTime: number;
  pauseTime: number;
}

export interface MigrationEstimation {
  // Size estimates
  totalDataSize: number;
  estimatedCompressedSize: number;

  // Time estimates
  estimatedDuration: number; // milliseconds
  estimatedCompletionTime: Date;

  // Performance metrics
  averageItemProcessingTime: number;
  estimatedThroughput: number; // bytes per second

  // Confidence
  confidenceLevel: 'low' | 'medium' | 'high';
  sampleSize: number;
}

export interface MigrationCancellation {
  reason: 'user_request' | 'error' | 'timeout' | 'memory_pressure';
  timestamp: number;
  cleanupCompleted: boolean;
  dataRolledBack: boolean;
  backupRestored: boolean;
}

export interface MigrationPreview {
  // Dry run results
  canProceed: boolean;
  estimatedSuccess: boolean;

  // Sample validation
  sampleKeys: string[];
  validationResults: Array<{
    key: string;
    readable: boolean;
    writable: boolean;
    size: number;
  }>;

  // Warnings
  warnings: string[];

  // Resource checks
  storageAvailable: boolean;
  memoryAvailable: boolean;
  apiCompatible: boolean;
}

export type MigrationControlEvent =
  | { type: 'PAUSE_REQUESTED' }
  | { type: 'RESUME_REQUESTED' }
  | { type: 'CANCEL_REQUESTED' }
  | { type: 'PAUSED'; data: MigrationResumeData }
  | { type: 'RESUMED' }
  | { type: 'CANCELLED'; data: MigrationCancellation }
  | { type: 'ESTIMATION_COMPLETE'; data: MigrationEstimation }
  | { type: 'PREVIEW_COMPLETE'; data: MigrationPreview };

export interface MigrationControlCallbacks {
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: (cancellation: MigrationCancellation) => void;
  onEstimation?: (estimation: MigrationEstimation) => void;
  onPreview?: (preview: MigrationPreview) => void;
}