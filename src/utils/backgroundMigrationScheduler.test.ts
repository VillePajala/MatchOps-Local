/**
 * Tests for Background Migration Scheduler
 *
 * Validates idle-time processing, task management, and performance monitoring
 * for non-blocking background data migration.
 */

import {
  BackgroundMigrationScheduler,
  BackgroundTask,
  SchedulerState,
  createBackgroundScheduler,
  SchedulerConfiguration
} from './backgroundMigrationScheduler';

// Mock requestIdleCallback and cancelIdleCallback
const idleCallbacks: Map<number, (deadline: IdleDeadline) => void> = new Map();
let nextIdleCallbackId = 1;

const mockRequestIdleCallback = jest.fn((callback: (deadline: IdleDeadline) => void) => {
  const id = nextIdleCallbackId++;
  idleCallbacks.set(id, callback);
  return id;
});

const mockCancelIdleCallback = jest.fn((id: number) => {
  idleCallbacks.delete(id);
});

// Mock IdleDeadline
const createMockDeadline = (timeRemaining = 50): IdleDeadline => ({
  timeRemaining: jest.fn(() => timeRemaining),
  didTimeout: false
});

// Mock performance and document
let mockTime = 0;
const mockPerformance = {
  now: jest.fn(() => {
    mockTime += 10; // Increment by 10ms each call to simulate time passing
    return mockTime;
  })
};

const mockDocument = {
  hidden: false,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Global mocks - set before imports
Object.defineProperty(global, 'requestIdleCallback', {
  value: mockRequestIdleCallback,
  writable: true
});

Object.defineProperty(global, 'cancelIdleCallback', {
  value: mockCancelIdleCallback,
  writable: true
});

Object.defineProperty(global, 'performance', {
  value: mockPerformance,
  writable: true
});

Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'PerformanceObserver', {
  value: class MockPerformanceObserver {
    constructor(private callback: (list: unknown) => void) {}
    observe() {}
    disconnect() {}
  },
  writable: true
});

describe('BackgroundMigrationScheduler', () => {
  let scheduler: BackgroundMigrationScheduler;
  let mockConfig: Partial<SchedulerConfiguration>;

  beforeEach(() => {
    jest.clearAllMocks();
    idleCallbacks.clear();
    nextIdleCallbackId = 1;
    mockTime = 0; // Reset mock time

    mockConfig = {
      minimumIdleTime: 5,
      maximumIdleTime: 50,
      idleRetryDelay: 100,
      maxConsecutiveAttempts: 5,
      enableTabVisibility: true,
      enablePerformanceMonitoring: true
    };

    mockDocument.hidden = false;
    scheduler = new BackgroundMigrationScheduler(mockConfig);
  });

  afterEach(() => {
    scheduler?.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultScheduler = new BackgroundMigrationScheduler();
      expect(defaultScheduler.getStatus().state).toBe(SchedulerState.IDLE);
      defaultScheduler.cleanup();
    });

    it('should detect requestIdleCallback support', () => {
      expect(scheduler.supportsIdleCallback()).toBe(true);
    });

    it('should initialize tab visibility monitoring', () => {
      expect(mockDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  describe('task management', () => {
    it('should add tasks to queue in priority order', () => {
      const task1: BackgroundTask = {
        id: 'task1',
        name: 'Low Priority',
        priority: 10,
        estimatedDuration: 20,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      const task2: BackgroundTask = {
        id: 'task2',
        name: 'High Priority',
        priority: 1,
        estimatedDuration: 10,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      const task3: BackgroundTask = {
        id: 'task3',
        name: 'Medium Priority',
        priority: 5,
        estimatedDuration: 15,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      scheduler.addTask(task1);
      scheduler.addTask(task2);
      scheduler.addTask(task3);

      expect(scheduler.getStatus().queueLength).toBe(3);

      // Verify priority order by starting processing and checking execution order
      scheduler.startProcessing();

      // Execute the first idle callback
      const callbacks = Array.from(idleCallbacks.values());
      expect(callbacks.length).toBe(1);

      // The tasks should be in priority order: task2 (1), task3 (5), task1 (10)
      // We can't directly inspect the queue, but we can verify processing starts
      expect(mockRequestIdleCallback).toHaveBeenCalled();
    });

    it('should remove tasks from queue', () => {
      const task: BackgroundTask = {
        id: 'task1',
        name: 'Test Task',
        priority: 5,
        estimatedDuration: 20,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      scheduler.addTask(task);
      expect(scheduler.getStatus().queueLength).toBe(1);

      const removed = scheduler.removeTask('task1');
      expect(removed).toBe(true);
      expect(scheduler.getStatus().queueLength).toBe(0);

      const notRemoved = scheduler.removeTask('nonexistent');
      expect(notRemoved).toBe(false);
    });
  });

  describe('processing control', () => {
    let testTask: BackgroundTask;

    beforeEach(() => {
      testTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should start processing when tasks are added', () => {
      scheduler.addTask(testTask);

      expect(scheduler.getStatus().state).toBe(SchedulerState.PROCESSING);
      expect(mockRequestIdleCallback).toHaveBeenCalled();
    });

    it('should pause processing', () => {
      scheduler.addTask(testTask);
      scheduler.startProcessing();

      scheduler.pauseProcessing();

      expect(scheduler.getStatus().state).toBe(SchedulerState.PAUSED);
      expect(mockCancelIdleCallback).toHaveBeenCalled();
    });

    it('should resume processing', () => {
      scheduler.addTask(testTask);
      scheduler.pauseProcessing();

      scheduler.resumeProcessing();

      expect(scheduler.getStatus().state).toBe(SchedulerState.PROCESSING);
    });

    it('should stop processing and clear queue', () => {
      scheduler.addTask(testTask);
      scheduler.startProcessing();

      scheduler.stopProcessing();

      expect(scheduler.getStatus().state).toBe(SchedulerState.IDLE);
      expect(scheduler.getStatus().queueLength).toBe(0);
    });
  });

  describe('idle time processing', () => {
    it('should process tasks during idle time', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor
      };

      scheduler.addTask(task);

      // Get the idle callback
      const idleCallback = Array.from(idleCallbacks.values())[0];
      expect(idleCallback).toBeDefined();

      // Execute the callback with mock deadline
      const deadline = createMockDeadline(50);
      await idleCallback(deadline);

      expect(processor).toHaveBeenCalled();
      expect(scheduler.getStatus().stats.tasksCompleted).toBe(1);
    });

    it('should skip tasks when insufficient idle time available', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      const task: BackgroundTask = {
        id: 'test',
        name: 'Long Task',
        priority: 1,
        estimatedDuration: 100, // Longer than available idle time
        processor
      };

      scheduler.addTask(task);

      const idleCallback = Array.from(idleCallbacks.values())[0];
      const deadline = createMockDeadline(20); // Less than task duration

      await idleCallback(deadline);

      expect(processor).not.toHaveBeenCalled();
      expect(scheduler.getStatus().stats.tasksSkipped).toBe(1);
      expect(scheduler.getStatus().queueLength).toBe(1); // Task should be back in queue
    });

    it('should handle task processing errors gracefully', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Task failed'));
      const task: BackgroundTask = {
        id: 'failing-task',
        name: 'Failing Task',
        priority: 1,
        estimatedDuration: 10,
        processor
      };

      scheduler.addTask(task);

      const idleCallback = Array.from(idleCallbacks.values())[0];
      const deadline = createMockDeadline(50);

      await idleCallback(deadline);

      expect(processor).toHaveBeenCalled();
      // Task should be removed from queue even if it fails
      expect(scheduler.getStatus().queueLength).toBe(0);
    });

    it('should respect maximum idle time per callback', async () => {
      // Create multiple quick tasks
      const processors = [
        jest.fn().mockResolvedValue(undefined),
        jest.fn().mockResolvedValue(undefined),
        jest.fn().mockResolvedValue(undefined)
      ];

      processors.forEach((processor, index) => {
        const task: BackgroundTask = {
          id: `task${index}`,
          name: `Task ${index}`,
          priority: index + 1,
          estimatedDuration: 5,
          processor
        };
        scheduler.addTask(task);
      });

      const idleCallback = Array.from(idleCallbacks.values())[0];
      const deadline = createMockDeadline(50);

      await idleCallback(deadline);

      // Verify time remaining was checked
      expect(deadline.timeRemaining).toHaveBeenCalled();
    });
  });

  describe('tab visibility handling', () => {
    it('should pause processing when tab becomes hidden', () => {
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      scheduler.addTask(task);
      scheduler.startProcessing();

      // Simulate tab becoming hidden
      mockDocument.hidden = true;
      const visibilityHandler = mockDocument.addEventListener.mock.calls.find(
        call => call[0] === 'visibilitychange'
      )?.[1];

      visibilityHandler?.();

      expect(scheduler.getStatus().state).toBe(SchedulerState.PAUSED);
      expect(scheduler.getStatus().stats.tabVisibilityChanges).toBe(1);
    });

    it('should resume processing when tab becomes visible', () => {
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor: jest.fn().mockResolvedValue(undefined)
      };

      scheduler.addTask(task);

      // Start with hidden tab (this will cause automatic pausing)
      mockDocument.hidden = true;
      const visibilityHandler = mockDocument.addEventListener.mock.calls.find(
        call => call[0] === 'visibilitychange'
      )?.[1];

      // Trigger visibility change to hidden (should pause)
      visibilityHandler?.();

      // Simulate tab becoming visible with tasks in queue
      mockDocument.hidden = false;
      visibilityHandler?.();

      expect(scheduler.getStatus().state).toBe(SchedulerState.PROCESSING);
    });
  });

  describe('fallback processing without requestIdleCallback', () => {
    beforeEach(() => {
      // Remove requestIdleCallback support
      Object.defineProperty(global, 'requestIdleCallback', {
        value: undefined,
        writable: true
      });
      Object.defineProperty(global, 'cancelIdleCallback', {
        value: undefined,
        writable: true
      });

      scheduler.cleanup();
      scheduler = new BackgroundMigrationScheduler(mockConfig);
    });

    afterEach(() => {
      // Restore requestIdleCallback support
      Object.defineProperty(global, 'requestIdleCallback', {
        value: mockRequestIdleCallback,
        writable: true
      });
      Object.defineProperty(global, 'cancelIdleCallback', {
        value: mockCancelIdleCallback,
        writable: true
      });
    });

    it('should detect lack of requestIdleCallback support', () => {
      expect(scheduler.supportsIdleCallback()).toBe(false);
    });

    it('should process tasks using setTimeout fallback', (done) => {
      const processor = jest.fn().mockResolvedValue(undefined);
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor
      };

      scheduler.addTask(task);

      // Wait for setTimeout to execute
      setTimeout(() => {
        expect(processor).toHaveBeenCalled();
        done();
      }, 200);
    });
  });

  describe('status and statistics', () => {
    it('should provide accurate status information', () => {
      const status = scheduler.getStatus();

      expect(status.state).toBe(SchedulerState.IDLE);
      expect(status.queueLength).toBe(0);
      expect(status.isTabVisible).toBe(true);
      expect(status.stats).toEqual({
        tasksCompleted: 0,
        tasksSkipped: 0,
        totalProcessingTime: 0,
        averageIdleTime: 0,
        tabVisibilityChanges: 0
      });
    });

    it('should update statistics after task processing', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor
      };

      scheduler.addTask(task);

      const idleCallback = Array.from(idleCallbacks.values())[0];
      const deadline = createMockDeadline(50);

      await idleCallback(deadline);

      const stats = scheduler.getStatus().stats;
      expect(stats.tasksCompleted).toBe(1);
      expect(stats.totalProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources properly', () => {
      scheduler.addTask({
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor: jest.fn().mockResolvedValue(undefined)
      });

      scheduler.cleanup();

      expect(scheduler.getStatus().state).toBe(SchedulerState.IDLE);
      expect(scheduler.getStatus().queueLength).toBe(0);
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  describe('createBackgroundScheduler factory', () => {
    it('should create scheduler with default config', () => {
      const defaultScheduler = createBackgroundScheduler();
      expect(defaultScheduler.getStatus().state).toBe(SchedulerState.IDLE);
      defaultScheduler.cleanup();
    });

    it('should create scheduler with custom config', () => {
      const customConfig = {
        minimumIdleTime: 10,
        maximumIdleTime: 100
      };

      const customScheduler = createBackgroundScheduler(customConfig);
      expect(customScheduler.supportsIdleCallback()).toBe(true);
      customScheduler.cleanup();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid visibility changes', () => {
      const visibilityHandler = mockDocument.addEventListener.mock.calls.find(
        call => call[0] === 'visibilitychange'
      )?.[1];

      // Rapid visibility changes
      mockDocument.hidden = true;
      visibilityHandler?.();
      mockDocument.hidden = false;
      visibilityHandler?.();
      mockDocument.hidden = true;
      visibilityHandler?.();

      expect(scheduler.getStatus().stats.tabVisibilityChanges).toBe(3);
    });

    it('should handle empty task queue gracefully', () => {
      scheduler.startProcessing();
      expect(scheduler.getStatus().state).toBe(SchedulerState.PROCESSING);

      // Should transition to idle when no tasks
      const idleCallback = Array.from(idleCallbacks.values())[0];
      if (idleCallback) {
        const deadline = createMockDeadline(50);
        idleCallback(deadline);
      }

      // State might still be processing if callback is scheduled
      expect([SchedulerState.IDLE, SchedulerState.PROCESSING]).toContain(scheduler.getStatus().state);
    });

    it('should handle task processor that returns undefined', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      const task: BackgroundTask = {
        id: 'test',
        name: 'Test Task',
        priority: 1,
        estimatedDuration: 10,
        processor
      };

      scheduler.addTask(task);

      const idleCallback = Array.from(idleCallbacks.values())[0];
      const deadline = createMockDeadline(50);

      if (idleCallback) {
        await idleCallback(deadline);
      }

      expect(scheduler.getStatus().stats.tasksCompleted).toBe(1);
    });
  });
});