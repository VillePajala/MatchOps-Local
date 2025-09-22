/**
 * Storage Quota Pre-flight Check Utility
 *
 * Validates available storage quota before migration to prevent failures
 * and provides user-friendly warnings about storage limitations
 */

import logger from './logger';
import {
  STORAGE_QUOTA_WARNING_THRESHOLD,
  STORAGE_QUOTA_CRITICAL_THRESHOLD,
  STORAGE_OVERHEAD_FACTOR,
  STORAGE_BUFFER_FACTOR,
  MIGRATION_LARGE_DATASET_THRESHOLD
} from '@/config/migrationConfig';

export interface StorageQuotaInfo {
  quota: number;
  usage: number;
  available: number;
  isQuotaSupported: boolean;
}

export interface StorageEstimate {
  estimatedDataSize: number;
  estimatedBackupSize: number;
  totalRequiredSpace: number;
  hasEnoughSpace: boolean;
  warningThreshold: number;
}

export interface QuotaCheckResult {
  canProceed: boolean;
  quotaInfo: StorageQuotaInfo;
  estimate: StorageEstimate;
  warnings: string[];
  recommendations: string[];
}

/**
 * Get current storage quota information
 */
export async function getStorageQuotaInfo(): Promise<StorageQuotaInfo> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();

      return {
        quota: estimate.quota || 0,
        usage: estimate.usage || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0),
        isQuotaSupported: true
      };
    }
  } catch (error) {
    logger.warn('[Storage Quota] Failed to get quota information:', error);
  }

  return {
    quota: 0,
    usage: 0,
    available: 0,
    isQuotaSupported: false
  };
}

/**
 * Estimate storage requirements for migration
 */
export async function estimateMigrationStorageRequirements(): Promise<StorageEstimate> {
  try {
    // Estimate current localStorage data size
    let estimatedDataSize = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          // Rough size estimation: key + value + overhead
          estimatedDataSize += (key.length + value.length) * 2; // UTF-16 encoding
        }
      }
    }

    // Add metadata overhead estimation
    const metadataOverhead = estimatedDataSize * STORAGE_OVERHEAD_FACTOR;

    // Backup requires temporary duplicate storage
    const estimatedBackupSize = estimatedDataSize + metadataOverhead;

    // Total space needed during migration (original + backup + new storage + buffer)
    const totalRequiredSpace = estimatedDataSize + estimatedBackupSize + (estimatedDataSize * STORAGE_BUFFER_FACTOR);

    // Warning threshold configuration
    const quotaInfo = await getStorageQuotaInfo();
    const warningThreshold = quotaInfo.quota * STORAGE_QUOTA_WARNING_THRESHOLD;

    const hasEnoughSpace = quotaInfo.isQuotaSupported ?
      (quotaInfo.usage + totalRequiredSpace) < warningThreshold :
      true; // Assume OK if quota not supported

    return {
      estimatedDataSize,
      estimatedBackupSize,
      totalRequiredSpace,
      hasEnoughSpace,
      warningThreshold
    };
  } catch (error) {
    logger.error('[Storage Quota] Failed to estimate migration requirements:', error);

    // Return conservative estimate on error
    const conservativeDataSize = 50 * 1024 * 1024; // 50MB conservative estimate
    return {
      estimatedDataSize: conservativeDataSize,
      estimatedBackupSize: conservativeDataSize,
      totalRequiredSpace: conservativeDataSize * 3, // Conservative 3x multiplier
      hasEnoughSpace: false, // Be conservative on error
      warningThreshold: 0
    };
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Perform comprehensive pre-flight storage quota check
 */
export async function performStorageQuotaCheck(): Promise<QuotaCheckResult> {
  const quotaInfo = await getStorageQuotaInfo();
  const estimate = await estimateMigrationStorageRequirements();

  const warnings: string[] = [];
  const recommendations: string[] = [];
  let canProceed = true;

  // Check if quota information is available
  if (!quotaInfo.isQuotaSupported) {
    warnings.push('Storage quota information is not available on this browser');
    recommendations.push('Monitor storage usage manually during migration');
  } else {
    // Check current usage
    const usagePercentage = (quotaInfo.usage / quotaInfo.quota) * 100;

    const criticalThreshold = STORAGE_QUOTA_CRITICAL_THRESHOLD * 100; // Convert to percentage
    const warningThreshold = STORAGE_QUOTA_WARNING_THRESHOLD * 100; // Convert to percentage

    if (usagePercentage > criticalThreshold) {
      canProceed = false;
      warnings.push(`Storage is ${usagePercentage.toFixed(1)}% full (${formatBytes(quotaInfo.usage)} of ${formatBytes(quotaInfo.quota)})`);
      recommendations.push('Free up space before migration by clearing browser data or removing unused files');
    } else if (usagePercentage > warningThreshold) {
      warnings.push(`Storage is ${usagePercentage.toFixed(1)}% full - migration may fail if storage fills up`);
      recommendations.push('Consider freeing up space before migration to ensure success');
    }

    // Check if migration requirements fit
    const postMigrationUsage = quotaInfo.usage + estimate.totalRequiredSpace;
    const postMigrationPercentage = (postMigrationUsage / quotaInfo.quota) * 100;

    if (postMigrationPercentage > criticalThreshold) {
      canProceed = false;
      warnings.push(`Migration requires ${formatBytes(estimate.totalRequiredSpace)} but only ${formatBytes(quotaInfo.available)} available`);
      recommendations.push('Free up at least ' + formatBytes(estimate.totalRequiredSpace - quotaInfo.available) + ' of storage space');
    } else if (postMigrationPercentage > warningThreshold) {
      warnings.push(`Migration will use most available storage (${postMigrationPercentage.toFixed(1)}% after completion)`);
      recommendations.push('Consider freeing up additional space for future app usage');
    }
  }

  // Check data size reasonableness
  if (estimate.estimatedDataSize > MIGRATION_LARGE_DATASET_THRESHOLD) {
    warnings.push(`Large dataset detected (${formatBytes(estimate.estimatedDataSize)}) - migration may take several minutes`);
    recommendations.push('Ensure stable internet connection and avoid closing the browser during migration');
  }

  // Log quota check results
  logger.log('[Storage Quota Check]', {
    canProceed,
    quotaSupported: quotaInfo.isQuotaSupported,
    currentUsage: formatBytes(quotaInfo.usage),
    availableSpace: formatBytes(quotaInfo.available),
    estimatedRequired: formatBytes(estimate.totalRequiredSpace),
    dataSize: formatBytes(estimate.estimatedDataSize),
    warningsCount: warnings.length
  });

  return {
    canProceed,
    quotaInfo,
    estimate,
    warnings,
    recommendations
  };
}

/**
 * Get storage quota status for monitoring
 */
export async function getStorageQuotaStatus(): Promise<{
  usage: string;
  available: string;
  percentage: number;
  isLow: boolean;
}> {
  const quotaInfo = await getStorageQuotaInfo();

  if (!quotaInfo.isQuotaSupported) {
    return {
      usage: 'Unknown',
      available: 'Unknown',
      percentage: 0,
      isLow: false
    };
  }

  const percentage = (quotaInfo.usage / quotaInfo.quota) * 100;

  return {
    usage: formatBytes(quotaInfo.usage),
    available: formatBytes(quotaInfo.available),
    percentage,
    isLow: percentage > (STORAGE_QUOTA_WARNING_THRESHOLD * 100)
  };
}