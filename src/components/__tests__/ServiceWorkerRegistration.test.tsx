import { render, waitFor, act } from '@testing-library/react';
import ServiceWorkerRegistration from '../ServiceWorkerRegistration';
import { PWA_CACHE_VERSION } from '@/config/pwaVersion';

// Mock logger
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

// Mock UpdateBanner
jest.mock('../UpdateBanner', () => {
  return function MockUpdateBanner() {
    return <div data-testid="update-banner">Update Available</div>;
  };
});

describe('ServiceWorkerRegistration', () => {
  let mockRegistration: Partial<ServiceWorkerRegistration>;
  let mockServiceWorker: Partial<ServiceWorker>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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

    // Mock navigator.serviceWorker
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue(mockRegistration),
        controller: mockServiceWorker,
        addEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock fetch for release notes
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notes: 'Test release notes' }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should register service worker on mount', async () => {
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(`/sw.js?v=${PWA_CACHE_VERSION}`);
    });
  });

  it('should check for updates every 60 seconds', async () => {
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Fast-forward 60 seconds
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Fast-forward another 60 seconds
    act(() => {
      jest.advanceTimersByTime(60000);
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

  it('should cleanup interval on unmount', async () => {
    const { unmount } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Verify update is called after 60 seconds
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Unmount component
    unmount();

    // Advance time - update should NOT be called again
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    // Still should be 1 (not 2) because interval was cleared
    expect(mockRegistration.update).toHaveBeenCalledTimes(1);
  });
});
