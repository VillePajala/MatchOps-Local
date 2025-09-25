/**
 * Migration Memory Monitor Component
 *
 * Provides real-time memory monitoring during migration with visual feedback
 * and user guidance for memory-related issues.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryPressureLevel } from '@/utils/memoryManager';
import { checkMigrationMemorySafety, MemoryCheckResult } from '@/utils/migrationMemorySafety';
import { HiExclamationTriangle, HiInformationCircle } from 'react-icons/hi2';
import logger from '@/utils/logger';

interface MigrationMemoryMonitorProps {
  isActive: boolean;
  onMemoryWarning?: (level: MemoryPressureLevel) => void;
  onMemoryEmergency?: () => void;
  className?: string;
}

const MigrationMemoryMonitor: React.FC<MigrationMemoryMonitorProps> = ({
  isActive,
  onMemoryWarning,
  onMemoryEmergency,
  className = ''
}) => {
  const { t } = useTranslation();
  const [memoryCheck, setMemoryCheck] = useState<MemoryCheckResult | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const updateMemoryStatus = useCallback(async () => {
    if (!isActive) return;

    try {
      const result = await checkMigrationMemorySafety();
      setMemoryCheck(result);
      setLastUpdate(new Date());

      // Trigger callbacks based on memory level
      if (result.level === MemoryPressureLevel.EMERGENCY && onMemoryEmergency) {
        onMemoryEmergency();
      } else if ((result.level === MemoryPressureLevel.CRITICAL ||
                 result.level === MemoryPressureLevel.HIGH) && onMemoryWarning) {
        onMemoryWarning(result.level);
      }
    } catch (error) {
      logger.warn('Failed to check memory status:', error);
    }
  }, [isActive, onMemoryWarning, onMemoryEmergency]);

  // Update memory status periodically while active
  useEffect(() => {
    if (!isActive) {
      setMemoryCheck(null);
      setLastUpdate(null);
      return;
    }

    // Initial check
    updateMemoryStatus();

    // Set up periodic monitoring
    const interval = setInterval(updateMemoryStatus, 2000); // Check every 2 seconds

    return () => {
      clearInterval(interval);
    };
  }, [isActive, updateMemoryStatus]);

  if (!isActive || !memoryCheck) {
    return null;
  }

  const getMemoryLevelColor = (level: MemoryPressureLevel): string => {
    switch (level) {
      case MemoryPressureLevel.LOW:
        return 'text-green-400 bg-green-900/20';
      case MemoryPressureLevel.MODERATE:
        return 'text-yellow-400 bg-yellow-900/20';
      case MemoryPressureLevel.HIGH:
        return 'text-orange-400 bg-orange-900/20';
      case MemoryPressureLevel.CRITICAL:
        return 'text-red-400 bg-red-900/20';
      case MemoryPressureLevel.EMERGENCY:
        return 'text-red-500 bg-red-900/40 animate-pulse';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
  };

  const getMemoryLevelIcon = (level: MemoryPressureLevel) => {
    if (level === MemoryPressureLevel.CRITICAL || level === MemoryPressureLevel.EMERGENCY) {
      return <HiExclamationTriangle className="h-4 w-4" />;
    }
    return <HiInformationCircle className="h-4 w-4" />;
  };

  const getMemoryRecommendation = (level: MemoryPressureLevel): string => {
    switch (level) {
      case MemoryPressureLevel.LOW:
        return t('memoryMonitor.recommendations.low', 'Memory usage is optimal');
      case MemoryPressureLevel.MODERATE:
        return t('memoryMonitor.recommendations.moderate', 'Memory usage is acceptable');
      case MemoryPressureLevel.HIGH:
        return t('memoryMonitor.recommendations.high', 'Consider closing other browser tabs');
      case MemoryPressureLevel.CRITICAL:
        return t('memoryMonitor.recommendations.critical', 'Close other applications to free memory');
      case MemoryPressureLevel.EMERGENCY:
        return t('memoryMonitor.recommendations.emergency', 'Migration paused - critical memory shortage');
      default:
        return '';
    }
  };

  const formatBytes = (bytes: number | undefined): string => {
    if (bytes === undefined) return 'Unknown';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const shouldShowWarning = memoryCheck.level === MemoryPressureLevel.CRITICAL ||
                           memoryCheck.level === MemoryPressureLevel.EMERGENCY;

  return (
    <div className={`p-3 rounded-lg border ${getMemoryLevelColor(memoryCheck.level)} ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        {getMemoryLevelIcon(memoryCheck.level)}
        <span className="text-sm font-medium">
          {t('memoryMonitor.title', 'Memory Status')}: {memoryCheck.level.toUpperCase()}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        {/* Memory usage percentage */}
        {memoryCheck.usagePercentage !== undefined && (
          <div className="flex justify-between">
            <span>{t('memoryMonitor.usage', 'Usage')}:</span>
            <span className="font-mono">{memoryCheck.usagePercentage.toFixed(1)}%</span>
          </div>
        )}

        {/* Available memory */}
        {memoryCheck.availableBytes !== undefined && (
          <div className="flex justify-between">
            <span>{t('memoryMonitor.available', 'Available')}:</span>
            <span className="font-mono">{formatBytes(memoryCheck.availableBytes)}</span>
          </div>
        )}

        {/* Action being taken */}
        <div className="flex justify-between">
          <span>{t('memoryMonitor.action', 'Action')}:</span>
          <span className="capitalize">{memoryCheck.action.replace('_', ' ')}</span>
        </div>

        {/* Last update time */}
        {lastUpdate && (
          <div className="flex justify-between text-gray-400">
            <span>{t('memoryMonitor.lastUpdate', 'Updated')}:</span>
            <span>{lastUpdate.toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Warning message and recommendation */}
      {shouldShowWarning && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-900/40 rounded text-xs">
          <p className="font-medium text-red-400 mb-1">
            {t('memoryMonitor.warning', 'Memory Warning')}
          </p>
          <p className="text-red-300">
            {memoryCheck.message}
          </p>
          <p className="text-red-200 mt-1 italic">
            {getMemoryRecommendation(memoryCheck.level)}
          </p>
        </div>
      )}

      {/* Normal recommendation */}
      {!shouldShowWarning && memoryCheck.level !== MemoryPressureLevel.LOW && (
        <div className="mt-2 text-xs text-gray-300 italic">
          {getMemoryRecommendation(memoryCheck.level)}
        </div>
      )}
    </div>
  );
};

export default MigrationMemoryMonitor;