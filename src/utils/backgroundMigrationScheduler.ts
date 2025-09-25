/**
 * Background Migration Scheduler
 *
 * Manages idle-time processing for non-blocking data migration using requestIdleCallback.
 * Adapts processing based on available CPU time and tab visibility to ensure optimal
 * user experience while migrating data in the background.
 */

import logger from './logger';

/**
 * Scheduler configuration options
 */
export interface SchedulerConfiguration {
  /** Minimum idle time required before starting background processing (ms) */
  minimumIdleTime: number;
  /** Maximum time to spend in a single idle callback (ms) */
  maximumIdleTime: number;
  /** Delay between idle processing attempts when no idle time available (ms) */
  idleRetryDelay: number;
  /** Maximum number of consecutive idle processing attempts */
  maxConsecutiveAttempts: number;
  /** Enable tab visibility detection */
  enableTabVisibility: boolean;
  /** Enable performance monitoring */
  enablePerformanceMonitoring: boolean;
}

/**
 * Background processing task
 */
export interface BackgroundTask {
  id: string;
  name: string;
  priority: number; // Lower numbers = higher priority
  estimatedDuration: number; // Milliseconds
  processor: () => Promise<void>;
  onError?: (error: Error) => void; // Optional error callback
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  tasksCompleted: number;
  tasksSkipped: number;
  totalProcessingTime: number;
  averageIdleTime: number;
  tabVisibilityChanges: number;
}

/**
 * Scheduler state
 */
export enum SchedulerState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  PAUSED = 'paused',
  THROTTLED = 'throttled'
}

/**
 * Default scheduler configuration
 */
const DEFAULT_SCHEDULER_CONFIG: SchedulerConfiguration = {
  minimumIdleTime: 5, // 5ms minimum
  maximumIdleTime: 50, // 50ms maximum per callback
  idleRetryDelay: 1000, // 1 second retry delay
  maxConsecutiveAttempts: 10,
  enableTabVisibility: true,
  enablePerformanceMonitoring: true
};

/**
 * Manages background processing during browser idle time
 */
export class BackgroundMigrationScheduler {
  private config: SchedulerConfiguration;
  private state: SchedulerState = SchedulerState.IDLE;
  private taskQueue: BackgroundTask[] = [];
  private stats: ProcessingStats = {
    tasksCompleted: 0,
    tasksSkipped: 0,
    totalProcessingTime: 0,
    averageIdleTime: 0,
    tabVisibilityChanges: 0
  };

  private consecutiveAttempts = 0;
  private isTabVisible = true;
  private performanceObserver?: PerformanceObserver;
  private visibilityHandler?: () => void;
  private currentIdleCallbackId?: number;
  private fallbackTimerId?: NodeJS.Timeout;
  private isProcessingLocked = false;

  // Performance metrics
  private recentIdleTimes: number[] = [];
  private lastPerformanceCheck = Date.now();

  constructor(config: Partial<SchedulerConfiguration> = {}) {
    // Validate configuration values
    if (config.minimumIdleTime !== undefined && config.minimumIdleTime < 0) {
      throw new Error('minimumIdleTime must be non-negative');
    }
    if (config.maximumIdleTime !== undefined && config.maximumIdleTime < 0) {
      throw new Error('maximumIdleTime must be non-negative');
    }
    if (config.idleRetryDelay !== undefined && config.idleRetryDelay < 0) {
      throw new Error('idleRetryDelay must be non-negative');
    }
    if (config.maxConsecutiveAttempts !== undefined && config.maxConsecutiveAttempts < 1) {
      throw new Error('maxConsecutiveAttempts must be at least 1');
    }

    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.initializeMonitoring();
    logger.info('BackgroundMigrationScheduler initialized', {
      config: this.config,
      supportsIdleCallback: this.supportsIdleCallback()
    });
  }

  /**
   * Add a task to the background processing queue
   */
  addTask(task: BackgroundTask): void {
    // Insert task in priority order (lower priority number = higher priority)
    const insertIndex = this.taskQueue.findIndex(t => t.priority > task.priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }

    logger.debug('Background task added', {
      taskId: task.id,
      taskName: task.name,
      priority: task.priority,
      queueLength: this.taskQueue.length
    });

    // Start processing if not already running
    if (this.state === SchedulerState.IDLE) {
      this.startProcessing();
    }
  }

  /**
   * Remove a task from the queue
   */
  removeTask(taskId: string): boolean {
    const index = this.taskQueue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.taskQueue.splice(index, 1);
      logger.debug('Background task removed', { taskId, remainingTasks: this.taskQueue.length });
      return true;
    }
    return false;
  }

  /**
   * Start background processing
   */
  startProcessing(): void {
    if (this.state !== SchedulerState.IDLE) {
      logger.warn('Cannot start processing - scheduler not in idle state', { currentState: this.state });
      return;
    }

    this.state = SchedulerState.PROCESSING;
    this.consecutiveAttempts = 0;
    this.scheduleNextIdleCallback();

    logger.info('Background processing started', {
      queueLength: this.taskQueue.length,
      tabVisible: this.isTabVisible
    });
  }

  /**
   * Pause background processing
   */
  pauseProcessing(): void {
    // Cancel active idle callback
    if (this.currentIdleCallbackId && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(this.currentIdleCallbackId);
      this.currentIdleCallbackId = undefined;
    }

    // Cancel fallback timer
    if (this.fallbackTimerId) {
      clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = undefined;
    }

    this.isProcessingLocked = false;
    this.state = SchedulerState.PAUSED;
    logger.info('Background processing paused');
  }

  /**
   * Resume background processing
   */
  resumeProcessing(): void {
    if (this.state === SchedulerState.PAUSED) {
      this.state = SchedulerState.PROCESSING;
      this.scheduleNextIdleCallback();
      logger.info('Background processing resumed');
    }
  }

  /**
   * Stop all background processing and clear queue
   */
  stopProcessing(): void {
    // Cancel active idle callback
    if (this.currentIdleCallbackId && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(this.currentIdleCallbackId);
      this.currentIdleCallbackId = undefined;
    }

    // Cancel fallback timer
    if (this.fallbackTimerId) {
      clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = undefined;
    }

    this.isProcessingLocked = false;
    this.taskQueue = [];
    this.consecutiveAttempts = 0;
    this.state = SchedulerState.IDLE;
    logger.info('Background processing stopped and queue cleared');
  }

  /**
   * Get current scheduler status
   */
  getStatus(): {
    state: SchedulerState;
    queueLength: number;
    stats: ProcessingStats;
    isTabVisible: boolean;
  } {
    return {
      state: this.state,
      queueLength: this.taskQueue.length,
      stats: { ...this.stats },
      isTabVisible: this.isTabVisible
    };
  }

  /**
   * Check if browser supports requestIdleCallback
   */
  supportsIdleCallback(): boolean {
    return typeof requestIdleCallback === 'function' && typeof cancelIdleCallback === 'function';
  }

  /**
   * Check if browser supports PerformanceObserver with longtask entries
   */
  private isPerformanceObserverSupported(): boolean {
    if (typeof PerformanceObserver === 'undefined') {
      return false;
    }

    try {
      // Check if longtask entries are supported
      return PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopProcessing();

    if (this.visibilityHandler && this.config.enableTabVisibility) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    // Help garbage collection by clearing task references
    this.taskQueue.length = 0;

    logger.info('BackgroundMigrationScheduler cleanup completed');
  }

  /**
   * Initialize monitoring systems
   */
  private initializeMonitoring(): void {
    // Tab visibility monitoring
    if (this.config.enableTabVisibility && typeof document !== 'undefined') {
      this.isTabVisible = !document.hidden;

      this.visibilityHandler = () => {
        const wasVisible = this.isTabVisible;
        this.isTabVisible = !document.hidden;

        if (wasVisible !== this.isTabVisible) {
          this.stats.tabVisibilityChanges++;

          if (!this.isTabVisible && this.state === SchedulerState.PROCESSING) {
            // Tab became hidden - pause processing
            this.pauseProcessing();
            logger.debug('Processing paused - tab not visible');
          } else if (this.isTabVisible && this.state === SchedulerState.PAUSED && this.taskQueue.length > 0) {
            // Tab became visible - resume processing if we have tasks
            this.resumeProcessing();
            logger.debug('Processing resumed - tab visible');
          }
        }
      };

      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Performance monitoring with enhanced feature detection
    if (this.config.enablePerformanceMonitoring && this.isPerformanceObserverSupported()) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          // Monitor for long tasks that might indicate CPU pressure
          const longTasks = entries.filter(entry => entry.duration > 50); // Tasks > 50ms

          if (longTasks.length > 0) {
            logger.debug('Long tasks detected - may throttle background processing', {
              longTaskCount: longTasks.length,
              maxDuration: Math.max(...longTasks.map(t => t.duration))
            });

            // Consider throttling if we see many long tasks
            if (longTasks.length > 3 && this.state === SchedulerState.PROCESSING) {
              this.throttleProcessing();
            }
          }
        });

        this.performanceObserver.observe({ entryTypes: ['longtask'] });
      } catch (error) {
        logger.warn('Performance monitoring not available', { error });
      }
    }
  }

  /**
   * Schedule the next idle callback
   */
  private scheduleNextIdleCallback(): void {
    if (this.state !== SchedulerState.PROCESSING || !this.isTabVisible || this.isProcessingLocked) {
      return;
    }

    this.isProcessingLocked = true;

    if (!this.supportsIdleCallback()) {
      // Fallback to setTimeout if requestIdleCallback not available
      this.fallbackTimerId = setTimeout(() => this.processTasksWithTimeout(), this.config.idleRetryDelay);
      return;
    }

    const options = {
      timeout: this.config.idleRetryDelay // Maximum wait time
    };

    this.currentIdleCallbackId = requestIdleCallback((deadline) => {
      this.processTasksInIdleTime(deadline);
    }, options);
  }

  /**
   * Process tasks during idle time
   */
  private async processTasksInIdleTime(deadline: IdleDeadline): Promise<void> {
    const startTime = performance.now();

    try {
      while (
        this.taskQueue.length > 0 &&
        deadline.timeRemaining() > this.config.minimumIdleTime &&
        this.state === SchedulerState.PROCESSING
      ) {
        const availableTime = Math.min(deadline.timeRemaining(), this.config.maximumIdleTime);
        const taskStartTime = performance.now();

        const task = this.taskQueue.shift()!;

        // Skip task if estimated duration exceeds available time
        if (task.estimatedDuration > availableTime) {
          this.taskQueue.unshift(task); // Put task back
          this.stats.tasksSkipped++;
          logger.debug('Task skipped - insufficient idle time', {
            taskId: task.id,
            estimatedDuration: task.estimatedDuration,
            availableTime
          });
          break;
        }

        // Execute the task
        try {
          await task.processor();

          const taskDuration = performance.now() - taskStartTime;
          this.stats.tasksCompleted++;
          this.stats.totalProcessingTime += taskDuration;

          logger.debug('Background task completed', {
            taskId: task.id,
            duration: taskDuration,
            remainingTasks: this.taskQueue.length
          });
        } catch (error) {
          const taskError = error instanceof Error ? error : new Error(String(error));
          logger.error('Background task failed', {
            taskId: task.id,
            taskName: task.name,
            error: taskError.message
          });

          // Call error callback if provided
          if (task.onError) {
            try {
              task.onError(taskError);
            } catch (callbackError) {
              logger.error('Task error callback failed', {
                taskId: task.id,
                callbackError: callbackError instanceof Error ? callbackError.message : String(callbackError)
              });
            }
          }
        }
      }

      // Update idle time statistics with additional bounds checking
      const idleTime = performance.now() - startTime;
      if (isFinite(idleTime) && idleTime >= 0) {
        this.recentIdleTimes.push(idleTime);
        // Ensure we don't exceed our limit even in edge cases
        while (this.recentIdleTimes.length > 10) {
          this.recentIdleTimes.shift();
        }
        if (this.recentIdleTimes.length > 0) {
          this.stats.averageIdleTime = this.recentIdleTimes.reduce((a, b) => a + b, 0) / this.recentIdleTimes.length;
        }
      }

      this.consecutiveAttempts++;

      // Continue processing if we have more tasks
      if (this.taskQueue.length > 0 && this.consecutiveAttempts < this.config.maxConsecutiveAttempts) {
        this.isProcessingLocked = false; // Unlock before scheduling next
        this.scheduleNextIdleCallback();
      } else {
        // Take a break or finish
        this.isProcessingLocked = false; // Unlock processing
        if (this.taskQueue.length === 0) {
          this.state = SchedulerState.IDLE;
          logger.info('Background processing completed - queue empty', { stats: this.stats });
        } else {
          // Reset attempt counter and continue after delay
          this.consecutiveAttempts = 0;
          setTimeout(() => this.scheduleNextIdleCallback(), this.config.idleRetryDelay);
        }
      }

    } catch (error) {
      this.isProcessingLocked = false; // Unlock on error
      logger.error('Error in idle processing', { error: error instanceof Error ? error.message : String(error) });
      this.state = SchedulerState.IDLE;
    }
  }

  /**
   * Fallback processing without requestIdleCallback
   */
  private async processTasksWithTimeout(): Promise<void> {
    if (this.state !== SchedulerState.PROCESSING || !this.isTabVisible || this.taskQueue.length === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    try {
      const startTime = performance.now();
      await task.processor();

      const duration = performance.now() - startTime;
      this.stats.tasksCompleted++;
      this.stats.totalProcessingTime += duration;

      logger.debug('Background task completed (timeout fallback)', {
        taskId: task.id,
        duration,
        remainingTasks: this.taskQueue.length
      });
    } catch (error) {
      const taskError = error instanceof Error ? error : new Error(String(error));
      logger.error('Background task failed (timeout fallback)', {
        taskId: task.id,
        error: taskError.message
      });

      // Call error callback if provided
      if (task.onError) {
        try {
          task.onError(taskError);
        } catch (callbackError) {
          logger.error('Task error callback failed (timeout fallback)', {
            taskId: task.id,
            callbackError: callbackError instanceof Error ? callbackError.message : String(callbackError)
          });
        }
      }
    }

    // Continue processing remaining tasks
    if (this.taskQueue.length > 0) {
      setTimeout(() => this.processTasksWithTimeout(), 100); // Short delay between tasks
    } else {
      this.state = SchedulerState.IDLE;
      logger.info('Background processing completed (timeout fallback)', { stats: this.stats });
    }
  }

  /**
   * Throttle processing due to high CPU usage
   */
  private throttleProcessing(): void {
    if (this.state === SchedulerState.PROCESSING) {
      this.state = SchedulerState.THROTTLED;

      // Cancel current idle callback
      if (this.currentIdleCallbackId && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(this.currentIdleCallbackId);
        this.currentIdleCallbackId = undefined;
      }

      // Resume after longer delay
      setTimeout(() => {
        if (this.state === SchedulerState.THROTTLED) {
          this.state = SchedulerState.PROCESSING;
          this.scheduleNextIdleCallback();
          logger.debug('Processing resumed after throttling');
        }
      }, this.config.idleRetryDelay * 3); // Triple the normal delay

      logger.info('Background processing throttled due to CPU pressure');
    }
  }
}

/**
 * Create configured background scheduler
 */
export function createBackgroundScheduler(config: Partial<SchedulerConfiguration> = {}): BackgroundMigrationScheduler {
  return new BackgroundMigrationScheduler(config);
}