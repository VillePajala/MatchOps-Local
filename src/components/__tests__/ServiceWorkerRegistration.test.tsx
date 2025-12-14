import { render, waitFor, act } from '@testing-library/react';
import ServiceWorkerRegistration from '../ServiceWorkerRegistration';

// Mock logger
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
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
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    });
  });

  it('should check for updates every 60 seconds', async () => {
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Should have called update immediately on mount
    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Fast-forward 60 seconds - should call update from interval
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(2);
    });

    // Fast-forward another 60 seconds - should call update again
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(3);
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

    // Verify fetch was called for release notes
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/release-notes.json'));
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

  it('should cleanup interval on unmount', async () => {
    const { unmount } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Should have called update immediately on mount
    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(1);
    });

    // Verify update is called after 60 seconds from interval
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockRegistration.update).toHaveBeenCalledTimes(2);
    });

    // Unmount component
    unmount();

    // Advance time - update should NOT be called again
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    // Still should be 2 (not 3) because interval was cleared
    expect(mockRegistration.update).toHaveBeenCalledTimes(2);
  });
});
