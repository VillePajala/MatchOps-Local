/**
 * lazyModal: a modal whose code can't be fetched (offline right after an update)
 * must not take down the screen underneath, and must retry on the next open.
 * @critical
 */
import React, { useState } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { lazyModal, warmLazyModals, isChunkLoadError, __resetWarmLazyModalsForTests } from '@/components/lazyModal';
import { ToastProvider } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), log: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

function chunkError(): Error {
  const err = new Error('Failed to load chunk /_next/static/chunks/abc.js from module 123');
  err.name = 'ChunkLoadError';
  return err;
}

interface ModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  label: string;
}

interface CancelProps {
  isOpen?: boolean;
  onCancel?: () => void;
}

const RealModal = ({ label }: ModalProps) => <div>{label} modal</div>;

/** The screen under the modal, with a button that opens it. */
function Host({ Modal, alwaysMounted = false }: { Modal: React.ComponentType<ModalProps>; alwaysMounted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p>Match field</p>
      <button onClick={() => setOpen(true)}>Open stats</button>
      {alwaysMounted ? (
        <Modal isOpen={open} onClose={() => setOpen(false)} label="Stats" />
      ) : (
        open && <Modal isOpen onClose={() => setOpen(false)} label="Stats" />
      )}
    </div>
  );
}

describe('lazyModal', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    // React reports errors caught by a boundary through console.error. Allow only the
    // chunk failures these tests provoke; anything else still fails the test.
    consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const text = args.map((a) => (a instanceof Error ? `${a.name} ${a.message}` : String(a))).join(' ');
      if (!/ChunkLoadError|Failed to load chunk|real bug/.test(text)) throw new Error(`Unexpected console.error: ${text}`);
    });
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the modal once its code has loaded', async () => {
    const Modal = lazyModal<ModalProps>(() => Promise.resolve({ default: RealModal }));
    render(<Host Modal={Modal} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Open stats'));
    });
    expect(await screen.findByText('Stats modal')).toBeInTheDocument();
  });

  it('keeps the screen, closes the modal and shows a toast when the code cannot be fetched; the next open retries', async () => {
    const loader = jest
      .fn<Promise<{ default: React.ComponentType<ModalProps> }>, []>()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: RealModal });
    const Modal = lazyModal<ModalProps>(loader);
    render(
      <ToastProvider>
        <Host Modal={Modal} />
      </ToastProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Open stats'));
    });
    expect(await screen.findByText(/couldn't be opened without a connection/)).toBeInTheDocument();
    expect(screen.getByText('Match field')).toBeInTheDocument();
    expect(screen.queryByText('Stats modal')).not.toBeInTheDocument();
    expect(logger.warn).toHaveBeenCalled();

    // Back online: opening again loads it (React.lazy's remembered failure is gone).
    await act(async () => {
      fireEvent.click(screen.getByText('Open stats'));
    });
    expect(await screen.findByText('Stats modal')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('closes a modal that closes through onCancel (new game setup), so it can be opened again', async () => {
    const loader = jest
      .fn<Promise<{ default: React.ComponentType<CancelProps> }>, []>()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: () => <div>Setup modal</div> });
    const Modal = lazyModal<CancelProps>(loader);
    function CancelHost() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>New game</button>
          {open && <Modal isOpen onCancel={() => setOpen(false)} />}
        </div>
      );
    }
    render(
      <ToastProvider>
        <CancelHost />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('New game'));
    });
    expect(await screen.findByText(/without a connection/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('New game'));
    });
    expect(await screen.findByText('Setup modal')).toBeInTheDocument();
  });

  it('stays silent for a modal that fails while mounted closed, and loads when opened later', async () => {
    const loader = jest
      .fn<Promise<{ default: React.ComponentType<ModalProps> }>, []>()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: RealModal });
    const Modal = lazyModal<ModalProps>(loader);
    render(
      <ToastProvider>
        <Host Modal={Modal} alwaysMounted />
      </ToastProvider>,
    );
    await waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(screen.queryByText(/without a connection/)).not.toBeInTheDocument();
    expect(screen.getByText('Match field')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Open stats'));
    });
    expect(await screen.findByText('Stats modal')).toBeInTheDocument();
  });

  it('passes other errors on to the outer error boundary', async () => {
    const Broken = () => {
      throw new Error('real bug');
    };
    const Modal = lazyModal<ModalProps>(() => Promise.resolve({ default: Broken }));
    class Outer extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? <p>Page error screen</p> : this.props.children;
      }
    }
    render(
      <Outer>
        <Host Modal={Modal} />
      </Outer>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Open stats'));
    });
    expect(await screen.findByText('Page error screen')).toBeInTheDocument();
  });
});

describe('isChunkLoadError', () => {
  it.each([
    [chunkError(), true],
    [new Error('Loading chunk 42 failed.'), true],
    [new Error('Loading CSS chunk 7 failed'), true],
    [new TypeError('Failed to fetch dynamically imported module: https://x/y.js'), true],
    [new TypeError('Importing a module script failed.'), true],
    [new Error('Cannot read properties of undefined'), false],
    ['Loading chunk 1 failed', false],
  ])('%s -> %s', (error, expected) => {
    expect(isChunkLoadError(error)).toBe(expected);
  });
});

describe('warmLazyModals', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  const setOnline = (value: boolean) =>
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });

  beforeEach(() => {
    jest.useFakeTimers();
    __resetWarmLazyModalsForTests();
  });
  afterEach(() => {
    jest.useRealTimers();
    delete (navigator as unknown as { onLine?: boolean }).onLine;
    if (originalOnLine) Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
  });

  it('fetches every registered modal once the browser is idle, only once', async () => {
    setOnline(true);
    const a = jest.fn(() => Promise.resolve({ default: RealModal }));
    const b = jest.fn(() => Promise.resolve({ default: RealModal }));
    lazyModal<ModalProps>(a);
    lazyModal<ModalProps>(b);

    warmLazyModals();
    expect(a).not.toHaveBeenCalled();
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    warmLazyModals();
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('waits for the connection when offline, then fetches', async () => {
    setOnline(false);
    const c = jest.fn(() => Promise.resolve({ default: RealModal }));
    lazyModal<ModalProps>(c);

    warmLazyModals();
    await act(async () => {
      await jest.runAllTimersAsync();
    });
    expect(c).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await jest.runAllTimersAsync();
    });
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('keeps going past a failed fetch while online, and retries the failed one on a timer', async () => {
    setOnline(true);
    const failing = jest
      .fn<Promise<{ default: React.ComponentType<ModalProps> }>, []>()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: RealModal });
    const after = jest.fn(() => Promise.resolve({ default: RealModal }));
    lazyModal<ModalProps>(failing);
    lazyModal<ModalProps>(after);

    warmLazyModals();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1); // not blocked by the failure

    // No 'online' event (the device never went offline): the timer retries.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000 + 3_000);
    });
    expect(failing).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(1); // already fetched, not fetched again
  });

  it('does nothing with Data Saver on', async () => {
    setOnline(true);
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const e = jest.fn(() => Promise.resolve({ default: RealModal }));
    lazyModal<ModalProps>(e);
    try {
      warmLazyModals();
      await act(async () => {
        await jest.runAllTimersAsync();
      });
      expect(e).not.toHaveBeenCalled();
    } finally {
      delete (navigator as unknown as { connection?: unknown }).connection;
    }
  });

  it('retries after a failed fetch when the connection comes back', async () => {
    setOnline(true);
    const d = jest
      .fn<Promise<{ default: React.ComponentType<ModalProps> }>, []>()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: RealModal });
    lazyModal<ModalProps>(d);

    warmLazyModals();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(d).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await jest.advanceTimersByTimeAsync(3_000);
    });
    expect(d).toHaveBeenCalledTimes(2);
  });
});
