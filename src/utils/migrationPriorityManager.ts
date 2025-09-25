/**
 * Migration Priority Manager
 *
 * Classifies data into priority levels for background migration processing.
 * Ensures critical data migrates immediately while non-critical data migrates
 * during idle time to maintain optimal user experience.
 */

import logger from './logger';

/**
 * Priority levels for data migration
 */
export enum MigrationPriority {
  /** Critical data that blocks app functionality - migrate immediately */
  CRITICAL = 'critical',
  /** Important data needed soon - migrate with medium priority */
  IMPORTANT = 'important',
  /** Background data that can wait - migrate during idle time only */
  BACKGROUND = 'background'
}

/**
 * Data classification result
 */
export interface DataClassification {
  key: string;
  priority: MigrationPriority;
  estimatedSize: number;
  reasoning: string;
}

/**
 * Configuration for priority thresholds
 */
export interface PriorityConfiguration {
  /** Maximum size (bytes) for critical data processing */
  criticalSizeLimit: number;
  /** Maximum size (bytes) for important data processing */
  importantSizeLimit: number;
  /** Age threshold (days) for considering data as background */
  backgroundAgeThreshold: number;
  /** Current game ID for priority detection */
  currentGameId?: string;
}

/**
 * Default priority configuration
 */
const DEFAULT_PRIORITY_CONFIG: PriorityConfiguration = {
  criticalSizeLimit: 50 * 1024, // 50KB
  importantSizeLimit: 500 * 1024, // 500KB
  backgroundAgeThreshold: 30, // 30 days
};

/**
 * Manages data migration priorities to optimize user experience
 */
export class MigrationPriorityManager {
  private config: PriorityConfiguration;

  constructor(config: Partial<PriorityConfiguration> = {}) {
    this.config = { ...DEFAULT_PRIORITY_CONFIG, ...config };
    logger.info('MigrationPriorityManager initialized', { config: this.config });
  }

  /**
   * Classify a data key based on its importance and characteristics
   */
  classifyData(key: string, size: number, metadata?: any): DataClassification {
    const priority = this.determinePriority(key, size, metadata);
    const reasoning = this.getClassificationReasoning(key, size, priority, metadata);

    const classification: DataClassification = {
      key,
      priority,
      estimatedSize: size,
      reasoning
    };

    logger.debug('Data classified', classification);
    return classification;
  }

  /**
   * Classify multiple data entries and sort by priority
   */
  classifyAndSortData(entries: Array<{ key: string; size: number; metadata?: any }>): DataClassification[] {
    const classifications = entries.map(entry =>
      this.classifyData(entry.key, entry.size, entry.metadata)
    );

    // Sort by priority: CRITICAL -> IMPORTANT -> BACKGROUND
    // Within same priority, sort by size (smaller first for faster processing)
    return classifications.sort((a, b) => {
      const priorityOrder = {
        [MigrationPriority.CRITICAL]: 0,
        [MigrationPriority.IMPORTANT]: 1,
        [MigrationPriority.BACKGROUND]: 2
      };

      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Same priority - sort by size (smaller first)
      return a.estimatedSize - b.estimatedSize;
    });
  }

  /**
   * Get data entries by priority level
   */
  getEntriesByPriority(classifications: DataClassification[], priority: MigrationPriority): DataClassification[] {
    return classifications.filter(c => c.priority === priority);
  }

  /**
   * Check if priority allows immediate processing
   */
  shouldProcessImmediately(priority: MigrationPriority): boolean {
    return priority === MigrationPriority.CRITICAL;
  }

  /**
   * Check if priority allows processing during idle time
   */
  shouldProcessDuringIdle(priority: MigrationPriority): boolean {
    return priority === MigrationPriority.BACKGROUND;
  }

  /**
   * Update current game ID for priority calculations
   */
  updateCurrentGameId(gameId: string | undefined): void {
    this.config.currentGameId = gameId;
    logger.debug('Updated current game ID for priority calculations', { gameId });
  }

  /**
   * Determine priority level based on key pattern and characteristics
   */
  private determinePriority(key: string, size: number, metadata?: any): MigrationPriority {
    // Critical data patterns - needed for basic app functionality (override size limits)
    if (this.isCriticalData(key, metadata)) {
      return MigrationPriority.CRITICAL;
    }

    // Large data sets are background unless they're important/recent
    if (size > this.config.importantSizeLimit) {
      // Check if it's important despite being large
      if (this.isImportantData(key, size, metadata)) {
        return MigrationPriority.IMPORTANT;
      }
      return MigrationPriority.BACKGROUND;
    }

    // Important data patterns - recent or actively used
    if (this.isImportantData(key, size, metadata)) {
      return MigrationPriority.IMPORTANT;
    }

    // Default to background for unknown data
    return MigrationPriority.BACKGROUND;
  }

  /**
   * Check if data is critical for app functionality
   */
  private isCriticalData(key: string, metadata?: any): boolean {
    const lowerKey = key.toLowerCase();

    // App settings and configuration
    if (lowerKey.includes('settings') || lowerKey.includes('config') || lowerKey.includes('preferences')) {
      return true;
    }

    // User authentication/profile data
    if (lowerKey.includes('profile') || lowerKey.includes('user') || lowerKey.includes('auth')) {
      return true;
    }

    // Current active game
    if (this.config.currentGameId && key.includes(this.config.currentGameId)) {
      return true;
    }

    // Version and migration metadata
    if (lowerKey.includes('version') || lowerKey.includes('migration')) {
      return true;
    }

    // Master roster (player database)
    if (lowerKey.includes('roster') || lowerKey.includes('players')) {
      return true;
    }

    return false;
  }

  /**
   * Check if data is important but not critical
   */
  private isImportantData(key: string, size: number, metadata?: any): boolean {
    const lowerKey = key.toLowerCase();

    // Small datasets are generally important (unless they're already critical)
    if (size < this.config.criticalSizeLimit) {
      return true;
    }

    // Recent games (within background age threshold)
    if (lowerKey.includes('game') || lowerKey.includes('match')) {
      if (metadata?.lastModified) {
        const ageInDays = (Date.now() - metadata.lastModified) / (1000 * 60 * 60 * 24);
        return ageInDays < this.config.backgroundAgeThreshold;
      } else if (lowerKey.includes('game') || lowerKey.includes('stats')) {
        // Game-related keys without metadata - check if size is reasonable
        return size < this.config.importantSizeLimit;
      }
    }

    // Current season data
    if (lowerKey.includes('season') || lowerKey.includes('tournament')) {
      if (metadata?.isActive || metadata?.isCurrent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate human-readable reasoning for classification decision
   */
  private getClassificationReasoning(
    key: string,
    size: number,
    priority: MigrationPriority,
    metadata?: any
  ): string {
    const lowerKey = key.toLowerCase();

    switch (priority) {
      case MigrationPriority.CRITICAL:
        if (lowerKey.includes('settings') || lowerKey.includes('config')) return 'App settings required for basic functionality';
        if (lowerKey.includes('roster')) return 'Player roster needed for game creation';
        if (this.config.currentGameId && key.includes(this.config.currentGameId))
          return 'Current active game data';
        return 'Critical app functionality data';

      case MigrationPriority.IMPORTANT:
        if (size < this.config.criticalSizeLimit) return 'Small dataset - migrate soon';
        if (lowerKey.includes('game') || lowerKey.includes('season') || lowerKey.includes('tournament')) {
          if (metadata?.isActive || metadata?.isCurrent || metadata?.lastModified) {
            return 'Recent or active data';
          }
        }
        return 'Important data needed for optimal experience';

      case MigrationPriority.BACKGROUND:
        if (size > this.config.importantSizeLimit) return 'Large dataset - migrate during idle time';
        return 'Historical data - migrate when convenient';
    }
  }
}

/**
 * Create configured priority manager instance
 */
export function createPriorityManager(config: Partial<PriorityConfiguration> = {}): MigrationPriorityManager {
  return new MigrationPriorityManager(config);
}