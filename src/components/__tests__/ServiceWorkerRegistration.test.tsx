import { render, waitFor, act } from '@testing-library/react';
import ServiceWorkerRegistration from '../ServiceWorkerRegistration';

// Mock logger
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock appSettings to avoid IndexedDB dependency in tests
jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn().mockResolvedValue({ language: 'fi' }),
}));

// Mock UpdateBanner - capture props for testing
const mockUpdateBannerProps = { notes: undefined as string | undefined };
jest.mock('../UpdateBanner', () => {
  return function MockUpdateBanner(props: { notes?: string }) {
    mockUpdateBannerProps.notes = props.notes;
    return <div data-testid="update-banner">{props.notes || 'Update Available'}</div>;
  };
});

describe('ServiceWorkerRegistration', () => {
  let mockRegistration: Partial<ServiceWorkerRegistration>;
  let mockServiceWorker: Partial<ServiceWorker>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUpdateBannerProps.notes = undefined;

    mockServiceWorker = {
      state: 'activated',
      postMessage: jest.fn(),
    };

    mockRegistration = {
      waiting: null,
      installing: null,
      active: mockServiceWorker as ServiceWorker,
      update: jest.fn().mockResolvedValue(undefined),
      onupdatefound: null,
    };

    // Mock navigator.onLine as true (online)
    Object.defineProperty(global.navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Mock navigator.serviceWorker
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue(mockRegistration),
        getRegistration: jest.fn().mockResolvedValue(mockRegistration),
        controller: mockServiceWorker,
        addEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock document event listeners for visibility change
    jest.spyOn(document, 'addEventListener').mockImplementation(() => {});
    jest.spyOn(document, 'removeEventListener').mockImplementation(() => {});
    jest.spyOn(window, 'addEventListener').mockImplementation(() => {});
    jest.spyOn(window, 'removeEventListener').mockImplementation(() => {});

    // Mock fetch for changelog.json - matches actual format with language-specific notes
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'test123',
        date: '2025-12-14',
        notes: {
          en: 'Test release notes EN',
          fi: 'Test release notes'
        }
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should register service worker on mount', async () => {
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    });
  });

  it('should check for updates on interval (hourly in prod/test, 60s in dev)', async () => {
    // In test environment (NODE_ENV !== 'development'), interval is 1 hour
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Should have called update immediately on mount
    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Fast-forward 1 hour - should call update from interval (prod/test mode)
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(2);
    });
  });

  it('should show update banner when new service worker is waiting', async () => {
    const waitingWorker = {
      state: 'installed',
      postMessage: jest.fn(),
    } as Partial<ServiceWorker>;

    Object.defineProperty(mockRegistration, 'waiting', {
      value: waitingWorker as ServiceWorker,
      writable: true,
      configurable: true,
    });

    const { getByTestId } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(getByTestId('update-banner')).toBeInTheDocument();
    });
  });

  it('should fetch and display release notes when update is available', async () => {
    const waitingWorker = {
      state: 'installed',
      postMessage: jest.fn(),
    } as Partial<ServiceWorker>;

    Object.defineProperty(mockRegistration, 'waiting', {
      value: waitingWorker as ServiceWorker,
      writable: true,
      configurable: true,
    });

    const { getByTestId } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(getByTestId('update-banner')).toBeInTheDocument();
    });

    // Verify fetch was called for changelog
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/changelog.json'));
    });

    // Verify notes are passed to UpdateBanner
    await waitFor(() => {
      expect(mockUpdateBannerProps.notes).toBe('Test release notes');
    });
  });

  it('should handle release notes fetch failure gracefully', async () => {
    // Make fetch fail
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const waitingWorker = {
      state: 'installed',
      postMessage: jest.fn(),
    } as Partial<ServiceWorker>;

    Object.defineProperty(mockRegistration, 'waiting', {
      value: waitingWorker as ServiceWorker,
      writable: true,
      configurable: true,
    });

    const { getByTestId } = render(<ServiceWorkerRegistration />);

    // Update banner should still show even if notes fetch fails
    await waitFor(() => {
      expect(getByTestId('update-banner')).toBeInTheDocument();
    });

    // Notes should be undefined (not blocking the banner)
    expect(mockUpdateBannerProps.notes).toBeUndefined();
  });

  it('should cleanup interval and event listeners on unmount', async () => {
    const { unmount } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Should have called update immediately on mount
    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Verify event listeners were added
    expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));

    // Verify update is called after 1 hour from interval (prod/test mode)
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(2);
    });

    // Unmount component
    unmount();

    // Advance time - update should NOT be called again
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    });

    // Still should be 2 (not 3) because interval was cleared
    expect(mockRegistration.update).toHaveBeenCalledTimes(2);
  });
});
