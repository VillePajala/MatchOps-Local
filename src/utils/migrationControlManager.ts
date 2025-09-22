/**
 * Migration Control Manager
 *
 * Handles pause/resume, cancellation, and estimation for IndexedDB migration
 */

import {
  MigrationControl,
  MigrationResumeData,
  MigrationEstimation,
  MigrationCancellation,
  MigrationPreview,
  MigrationControlCallbacks
} from '@/types/migrationControl';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './localStorageAdapter';
import { generateResumeDataChecksum, verifyResumeDataIntegrity } from './checksumUtils';
import logger from './logger';

export class MigrationControlManager {
  private control: MigrationControl;
  private callbacks: MigrationControlCallbacks;
  private sessionId: string;
  private checkpointCounter: number = 0;
  private localStorageAdapter: LocalStorageAdapter;
  private memoryCheckCache: { result: boolean; timestamp: number } | null = null;

  // Rate limiting for operations
  private operationCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_OPERATIONS_PER_WINDOW = 10;

  constructor(callbacks: MigrationControlCallbacks = {}) {
    this.callbacks = callbacks;
    this.sessionId = this.generateSessionId();
    this.localStorageAdapter = new LocalStorageAdapter();

    this.control = {
      canPause: MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE,
      canCancel: MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL,
      canResume: false,
      isPaused: false,
      isCancelling: false
    };

    // Check for existing resume data
    this.loadResumeData();
  }

  /**
   * Request pause of migration
   */
  public async requestPause(): Promise<void> {
    if (!this.control.canPause || this.control.isPaused) {
      return;
    }

    // Check rate limit
    if (!this.checkRateLimit('pause')) {
      throw new Error('Rate limit exceeded for pause operations. Please wait before trying again.');
    }

    logger.log('Migration pause requested');
    this.control.isPaused = true;

    // Will be called by orchestrator at next pause point
  }

  /**
   * Save pause state for resume
   */
  public async savePauseState(
    lastProcessedKey: string,
    processedKeys: string[],
    remainingKeys: string[],
    itemsProcessed: number,
    totalItems: number,
    bytesProcessed: number,
    totalBytes: number
  ): Promise<void> {
    const resumeData: MigrationResumeData = {
      lastProcessedKey,
      processedKeys,
      remainingKeys,
      itemsProcessed,
      totalItems,
      bytesProcessed,
      totalBytes,
      checkpointId: `checkpoint_${Date.now()}`,
      checkpointTimestamp: Date.now(),
      sessionId: this.sessionId,
      startTime: Date.now() - (itemsProcessed * 100), // Approximate
      pauseTime: Date.now()
    };

    this.control.resumeData = resumeData;
    this.control.canResume = true; // Enable resume capability

    // Persist to storage
    await this.saveResumeData(resumeData);

    logger.log('Migration paused and state saved', {
      itemsProcessed,
      remainingItems: totalItems - itemsProcessed
    });

    this.callbacks.onPause?.();
  }

  /**
   * Resume migration from saved state
   */
  public async requestResume(): Promise<MigrationResumeData | null> {
    if (!this.control.canResume || !this.control.resumeData) {
      return null;
    }

    // Check rate limit
    if (!this.checkRateLimit('resume')) {
      throw new Error('Rate limit exceeded for resume operations. Please wait before trying again.');
    }

    logger.log('Migration resume requested');
    this.control.isPaused = false;
    this.control.canResume = false;

    const resumeData = this.control.resumeData;
    this.callbacks.onResume?.();

    // Clear saved state after successful resume
    await this.clearResumeData();

    return resumeData;
  }

  /**
   * Request cancellation of migration
   */
  public async requestCancel(reason: MigrationCancellation['reason'] = 'user_request'): Promise<void> {
    if (!this.control.canCancel || this.control.isCancelling) {
      return;
    }

    logger.log('Migration cancellation requested', { reason });
    this.control.isCancelling = true;

    const cancellation: MigrationCancellation = {
      reason,
      timestamp: Date.now(),
      cleanupCompleted: false,
      dataRolledBack: false,
      backupRestored: false
    };

    // Orchestrator will handle actual cancellation
    this.callbacks.onCancel?.(cancellation);
  }

  /**
   * Mark cancellation as completed with rollback status
   */
  public async completeCancellation(
    dataRolledBack: boolean,
    cleanupCompleted: boolean = true,
    backupRestored: boolean = false
  ): Promise<void> {
    if (!this.control.isCancelling) {
      return;
    }

    const cancellation: MigrationCancellation = {
      reason: 'user_request',
      timestamp: Date.now(),
      cleanupCompleted,
      dataRolledBack,
      backupRestored
    };

    this.control.isCancelling = false;
    this.callbacks.onCancel?.(cancellation);

    logger.log('Migration cancellation completed', cancellation);
  }

  /**
   * Estimate migration duration and size
   */
  public async estimateMigration(keys: string[]): Promise<MigrationEstimation> {
    // Input validation
    if (!Array.isArray(keys)) {
      throw new Error('Keys must be an array');
    }

    if (keys.length === 0) {
      throw new Error('Keys array cannot be empty');
    }

    if (keys.length > 100000) { // Prevent DoS with excessive keys
      throw new Error('Too many keys provided for estimation (max: 100,000)');
    }

    // Validate each key
    const invalidKeys = keys.filter(key =>
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > 1000 || // Prevent excessive key lengths
      key.includes('\x00') || // Null bytes
      key.includes('\n') || key.includes('\r') // Line breaks
    );

    if (invalidKeys.length > 0) {
      throw new Error(`Invalid keys detected: ${invalidKeys.slice(0, 5).join(', ')}${invalidKeys.length > 5 ? '...' : ''}`);
    }

    logger.log('Estimating migration', { totalKeys: keys.length });

    const sampleSize = this.calculateOptimalSampleSize(keys.length);

    let totalSize = 0;
    let totalTime = 0;
    let sampledItems = 0;

    // Use stratified sampling for better representation
    const sampleKeys = this.selectStratifiedSample(keys, sampleSize);

    logger.log('Using adaptive sampling strategy', {
      totalKeys: keys.length,
      sampleSize: sampleKeys.length,
      samplingStrategy: sampleKeys.length < keys.length ? 'stratified' : 'complete'
    });

    // Sample selected items to estimate speed
    for (const key of sampleKeys) {
      const itemStart = performance.now();

      try {
        const value = await this.localStorageAdapter.getItem(key);
        if (value) {
          const size = new Blob([value]).size;
          totalSize += size;
          sampledItems++;
        }
      } catch (error) {
        logger.error('Error sampling item for estimation', { key, error });
      }

      totalTime += performance.now() - itemStart;

      // Break if sampling is taking too long (>5 seconds)
      if (totalTime > 5000) {
        logger.warn('Sampling timeout - using partial data for estimation', {
          sampledItems,
          totalTime
        });
        break;
      }
    }

    // Calculate estimates using actual sampled items
    const averageSize = sampledItems > 0 ? totalSize / sampledItems : 0;
    const averageTime = sampledItems > 0 ? totalTime / sampledItems : 0;
    const estimatedTotalSize = averageSize * keys.length;
    const estimatedDuration = averageTime * keys.length;

    // Adjust for IndexedDB being typically faster than localStorage reads
    const adjustedDuration = estimatedDuration * 0.7;

    // Calculate confidence based on sample quality
    const confidence = this.calculateConfidenceLevel(sampledItems, keys.length, totalTime);

    const estimation: MigrationEstimation = {
      totalDataSize: estimatedTotalSize,
      estimatedCompressedSize: estimatedTotalSize * 0.9, // Assume 10% compression
      estimatedDuration: adjustedDuration,
      estimatedCompletionTime: new Date(Date.now() + adjustedDuration),
      averageItemProcessingTime: averageTime,
      estimatedThroughput: totalTime > 0 ? totalSize / (totalTime / 1000) : 0, // bytes per second
      confidenceLevel: confidence,
      sampleSize: sampledItems
    };

    logger.log('Migration estimation complete', estimation);
    this.callbacks.onEstimation?.(estimation);

    return estimation;
  }

  /**
   * Preview migration without actually performing it
   */
  public async previewMigration(keys: string[]): Promise<MigrationPreview> {
    // Input validation (same as estimateMigration)
    if (!Array.isArray(keys)) {
      throw new Error('Keys must be an array');
    }

    if (keys.length === 0) {
      throw new Error('Keys array cannot be empty');
    }

    if (keys.length > 100000) { // Prevent DoS with excessive keys
      throw new Error('Too many keys provided for preview (max: 100,000)');
    }

    // Validate each key
    const invalidKeys = keys.filter(key =>
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > 1000 || // Prevent excessive key lengths
      key.includes('\x00') || // Null bytes
      key.includes('\n') || key.includes('\r') // Line breaks
    );

    if (invalidKeys.length > 0) {
      throw new Error(`Invalid keys detected: ${invalidKeys.slice(0, 5).join(', ')}${invalidKeys.length > 5 ? '...' : ''}`);
    }

    logger.log('Starting migration preview');

    const sampleSize = Math.min(
      MIGRATION_CONTROL_FEATURES.DRY_RUN_SAMPLE_SIZE,
      keys.length
    );

    const sampleKeys = keys.slice(0, sampleSize);
    const validationResults = [];
    const warnings = [];

    // Test each sample key
    for (const key of sampleKeys) {
      try {
        const value = await this.localStorageAdapter.getItem(key);
        const size = value ? new Blob([value]).size : 0;

        validationResults.push({
          key,
          readable: value !== null,
          writable: true, // Will test in actual implementation
          size
        });

        if (size > 1024 * 1024) { // 1MB
          warnings.push(`Large item detected: ${key} (${(size / 1024 / 1024).toFixed(2)}MB)`);
        }
      } catch {
        validationResults.push({
          key,
          readable: false,
          writable: false,
          size: 0
        });
        warnings.push(`Cannot access key: ${key}`);
      }
    }

    // Check resources
    const storageAvailable = await this.checkStorageAvailable();
    const memoryAvailable = this.checkMemoryAvailable();
    const apiCompatible = this.checkAPICompatibility();

    if (!storageAvailable) {
      warnings.push('Insufficient storage space available');
    }
    if (!memoryAvailable) {
      warnings.push('Low memory detected, migration may be slow');
    }
    if (!apiCompatible) {
      warnings.push('Some browser APIs may not be fully compatible');
    }

    const preview: MigrationPreview = {
      canProceed: storageAvailable && apiCompatible,
      estimatedSuccess: validationResults.every(r => r.readable) && warnings.length === 0,
      sampleKeys,
      validationResults,
      warnings,
      storageAvailable,
      memoryAvailable,
      apiCompatible
    };

    logger.log('Migration preview complete', preview);
    this.callbacks.onPreview?.(preview);

    return preview;
  }

  /**
   * Check if we should create a checkpoint
   */
  public shouldCreateCheckpoint(): boolean {
    this.checkpointCounter++;
    return this.checkpointCounter % MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL === 0;
  }

  /**
   * Check if migration is paused
   */
  public isPaused(): boolean {
    return this.control.isPaused;
  }

  /**
   * Check if migration is cancelling
   */
  public isCancelling(): boolean {
    return this.control.isCancelling;
  }

  /**
   * Get current control state
   */
  public getControlState(): MigrationControl {
    return { ...this.control };
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.clearResumeData();
    this.callbacks = {};
  }

  // Private helper methods

  /**
   * Check if operation is rate limited
   */
  private checkRateLimit(operation: string): boolean {
    const now = Date.now();
    const rateLimitKey = `${operation}_${this.sessionId}`;

    let operationData = this.operationCounts.get(rateLimitKey);

    // Initialize or reset window if expired
    if (!operationData || (now - operationData.windowStart) > this.RATE_LIMIT_WINDOW) {
      operationData = { count: 0, windowStart: now };
      this.operationCounts.set(rateLimitKey, operationData);
    }

    // Check if limit exceeded
    if (operationData.count >= this.MAX_OPERATIONS_PER_WINDOW) {
      logger.warn('Rate limit exceeded for operation', {
        operation,
        count: operationData.count,
        maxOperations: this.MAX_OPERATIONS_PER_WINDOW,
        windowStart: operationData.windowStart,
        sessionId: this.sessionId
      });
      return false;
    }

    // Increment counter
    operationData.count++;
    return true;
  }

  private async saveResumeData(data: MigrationResumeData): Promise<void> {
    try {
      // Generate checksum for data integrity
      const checksum = await generateResumeDataChecksum(data as unknown as Record<string, unknown>);
      const dataWithChecksum = {
        ...data,
        checksum
      };

      await this.localStorageAdapter.setItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        JSON.stringify(dataWithChecksum)
      );

      logger.log('Resume data saved with integrity checksum', {
        dataSize: JSON.stringify(dataWithChecksum).length,
        sessionId: this.sessionId,
        checksum: checksum.substring(0, 8) + '...' // Log partial checksum for debugging
      });
    } catch (error) {
      logger.error('Failed to save resume data', {
        error,
        dataSize: JSON.stringify(data).length,
        sessionId: this.sessionId,
        storageKey: MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      });
    }
  }

  private async loadResumeData(): Promise<void> {
    try {
      const saved = await this.localStorageAdapter.getItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );

      if (saved) {
        const parsedData = JSON.parse(saved);

        // Check if data has checksum (new format)
        if (parsedData.checksum) {
          const { checksum, ...resumeData } = parsedData;

          // Verify data integrity
          const isValid = await verifyResumeDataIntegrity(resumeData, checksum);

          if (isValid) {
            this.control.resumeData = resumeData;
            this.control.canResume = true;
            logger.log('Resume data loaded and verified', {
              sessionId: resumeData.sessionId,
              checksum: checksum.substring(0, 8) + '...'
            });
          } else {
            logger.error('Resume data integrity check failed - data may be corrupted', {
              expectedChecksum: checksum.substring(0, 8) + '...',
              sessionId: resumeData.sessionId
            });
            // Clear corrupted data
            await this.clearResumeData();
          }
        } else {
          // Legacy format without checksum - load with warning
          this.control.resumeData = parsedData;
          this.control.canResume = true;
          logger.warn('Loaded resume data without integrity check (legacy format)', {
            sessionId: parsedData.sessionId
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load resume data', {
        error,
        sessionId: this.sessionId,
        storageKey: MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      });
      // Clear potentially corrupted data
      await this.clearResumeData();
    }
  }

  private async clearResumeData(): Promise<void> {
    try {
      await this.localStorageAdapter.removeItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    } catch (error) {
      logger.error('Failed to clear resume data', {
        error,
        sessionId: this.sessionId,
        storageKey: MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      });
    }
  }

  private async checkStorageAvailable(): Promise<boolean> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const available = (estimate.quota || 0) - (estimate.usage || 0);
        return available > 50 * 1024 * 1024; // Need at least 50MB
      } catch {
        return true; // Assume available if can't check
      }
    }
    return true;
  }

  private checkMemoryAvailable(): boolean {
    // Cache for 5 seconds to avoid repeated checks
    if (this.memoryCheckCache && Date.now() - this.memoryCheckCache.timestamp < 5000) {
      return this.memoryCheckCache.result;
    }

    let result = true; // Assume available if can't check

    // Feature detection for Chrome-specific memory API
    if (this.isMemoryAPIAvailable()) {
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const used = memory.usedJSHeapSize;
      const limit = memory.jsHeapSizeLimit;
      result = used / limit < 0.8; // Less than 80% memory used

      logger.log('Memory check performed', {
        used: Math.round(used / 1024 / 1024),
        limit: Math.round(limit / 1024 / 1024),
        percentage: Math.round((used / limit) * 100),
        available: result
      });
    } else {
      logger.log('Memory API not available, assuming memory is available');
    }

    // Update cache
    this.memoryCheckCache = {
      result,
      timestamp: Date.now()
    };

    return result;
  }

  /**
   * Check if the memory API is available (Chrome-specific)
   */
  private isMemoryAPIAvailable(): boolean {
    return typeof performance !== 'undefined' &&
           'memory' in performance &&
           performance.memory !== null &&
           typeof (performance as unknown as { memory: unknown }).memory === 'object' &&
           'usedJSHeapSize' in (performance as unknown as { memory: Record<string, unknown> }).memory &&
           'jsHeapSizeLimit' in (performance as unknown as { memory: Record<string, unknown> }).memory;
  }

  private checkAPICompatibility(): boolean {
    return !!(
      typeof indexedDB !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      typeof Promise !== 'undefined'
    );
  }

  /**
   * Calculate optimal sample size based on dataset size and statistical requirements
   */
  private calculateOptimalSampleSize(totalSize: number): number {
    // For small datasets, sample everything
    if (totalSize <= 50) return totalSize;

    // Use statistical sampling formulas for larger datasets
    // Aim for 95% confidence level with 5% margin of error
    const confidenceLevel = 1.96; // Z-score for 95% confidence
    const marginOfError = 0.05;
    const populationProportion = 0.5; // Conservative estimate

    // Calculate required sample size using formula:
    // n = (Z^2 * p * (1-p)) / E^2
    const baseSampleSize = Math.ceil(
      (Math.pow(confidenceLevel, 2) * populationProportion * (1 - populationProportion)) /
      Math.pow(marginOfError, 2)
    );

    // Apply finite population correction for small populations
    const correctedSampleSize = Math.ceil(
      baseSampleSize / (1 + (baseSampleSize - 1) / totalSize)
    );

    // Set practical limits
    const minSample = Math.min(20, totalSize);
    const maxSample = Math.min(1000, Math.ceil(totalSize * 0.1)); // Max 10% of population

    const optimalSize = Math.max(minSample, Math.min(correctedSampleSize, maxSample));

    logger.log('Calculated optimal sample size', {
      totalSize,
      baseSampleSize,
      correctedSampleSize,
      optimalSize,
      samplingRatio: (optimalSize / totalSize * 100).toFixed(1) + '%'
    });

    return optimalSize;
  }

  /**
   * Select a stratified sample for better representation
   */
  private selectStratifiedSample(keys: string[], sampleSize: number): string[] {
    if (sampleSize >= keys.length) return keys;

    // Group keys by type/pattern for stratified sampling
    const keyGroups = this.groupKeysByType(keys);
    const selectedKeys: string[] = [];

    // Calculate samples per group proportionally
    const totalGroups = Object.keys(keyGroups).length;
    const samplesPerGroup = Math.floor(sampleSize / totalGroups);
    const remainder = sampleSize % totalGroups;

    let groupIndex = 0;
    for (const [, groupKeys] of Object.entries(keyGroups)) {
      const groupSampleSize = samplesPerGroup + (groupIndex < remainder ? 1 : 0);
      const groupSample = this.selectRandomSample(groupKeys, groupSampleSize);
      selectedKeys.push(...groupSample);
      groupIndex++;
    }

    // If we still need more samples, fill randomly
    if (selectedKeys.length < sampleSize) {
      const remainingKeys = keys.filter(key => !selectedKeys.includes(key));
      const additionalSamples = this.selectRandomSample(
        remainingKeys,
        sampleSize - selectedKeys.length
      );
      selectedKeys.push(...additionalSamples);
    }

    return selectedKeys.slice(0, sampleSize);
  }

  /**
   * Group keys by type for stratified sampling
   */
  private groupKeysByType(keys: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    for (const key of keys) {
      let groupType = 'other';

      // Classify keys by common patterns
      if (key.includes('game_')) groupType = 'games';
      else if (key.includes('player_') || key.includes('roster')) groupType = 'players';
      else if (key.includes('season_')) groupType = 'seasons';
      else if (key.includes('tournament_')) groupType = 'tournaments';
      else if (key.includes('settings')) groupType = 'settings';
      else if (key.includes('team_')) groupType = 'teams';

      if (!groups[groupType]) groups[groupType] = [];
      groups[groupType].push(key);
    }

    return groups;
  }

  /**
   * Select random sample from array
   */
  private selectRandomSample(items: string[], sampleSize: number): string[] {
    if (sampleSize >= items.length) return [...items];

    const shuffled = [...items];

    // Fisher-Yates shuffle for random selection
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, sampleSize);
  }

  /**
   * Calculate confidence level based on sample quality and completeness
   */
  private calculateConfidenceLevel(
    sampledItems: number,
    totalItems: number,
    samplingTime: number
  ): 'low' | 'medium' | 'high' {
    const samplingRatio = sampledItems / totalItems;
    const timeoutOccurred = samplingTime > 5000;

    // Reduce confidence if sampling was cut short
    if (timeoutOccurred) {
      return 'low';
    }

    // Base confidence on sampling ratio
    if (samplingRatio >= 0.1) return 'high';     // >10% sampled
    if (samplingRatio >= 0.05) return 'medium';  // 5-10% sampled
    if (samplingRatio >= 0.02) return 'medium';  // 2-5% sampled for large datasets
    return 'low';
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}