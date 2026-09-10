/**
 * @critical - this exists because the obvious link lands on page 1 on a phone,
 * which is what the owner reported. If the viewer opens the wrong page, or
 * silently shows nothing when the network is down, it is worse than the link
 * it replaced.
 *
 * pdfjs is mocked throughout: these tests must never reach Palloliitto's CDN.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RuleViewerModal from './RuleViewerModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(options?.[n] ?? '')),
  }),
}));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn() } }));

const renderPage = jest.fn();
const getPage = jest.fn();
const destroy = jest.fn(async () => {});
const getDocument = jest.fn((_opts: unknown) => ({
  promise: Promise.resolve({ numPages: 139, getPage, destroy }),
}));

jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (opts: unknown) => getDocument(opts),
  }),
  { virtual: true },
);

const URL_FOOTBALL = 'https://www-assets.palloliitto.fi/62562/jalkapallosaannot-2026.pdf';

beforeEach(() => {
  jest.clearAllMocks();
  renderPage.mockReturnValue({ promise: Promise.resolve(), cancel: jest.fn() });
  getPage.mockImplementation(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: renderPage,
  }));
  getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 139, getPage, destroy }) });
  // jsdom has no canvas 2d context.
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const props = { onClose: jest.fn(), url: URL_FOOTBALL, page: 65, title: 'Sääntö 12 - Kielletty peli' };

describe('RuleViewerModal', () => {
  it('renders nothing when closed, and never fetches', () => {
    const { container } = render(<RuleViewerModal {...props} isOpen={false} />);
    expect(container.firstChild).toBeNull();
    expect(getDocument).not.toHaveBeenCalled();
  });

  /**
   * @critical - the entire point. Opening Law 12 must show page 65, not page 1.
   */
  it('opens at the page it was asked for', async () => {
    render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    expect(screen.getByText(/Sivu 65/)).toBeInTheDocument();
  });

  /**
   * @critical - a coach may do this on mobile data at a pitch. Fetching the
   * whole 3MB book instead of the pages being read is the difference between
   * usable and not.
   */
  it('asks for the document by byte range rather than downloading it whole', async () => {
    render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: URL_FOOTBALL, disableRange: false, disableAutoFetch: true }),
    );
  });

  it('pages forward and back without re-downloading the document', async () => {
    render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));

    fireEvent.click(screen.getByTestId('rule-viewer-next'));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(66));

    fireEvent.click(screen.getByTestId('rule-viewer-prev'));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));

    // One document, three pages.
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('cannot page below the first page', async () => {
    render(<RuleViewerModal {...props} isOpen page={1} />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(screen.getByTestId('rule-viewer-prev')).toBeDisabled();
  });

  /**
   * @edge-case - offline at the pitch is the likeliest failure. It must say so
   * and offer the browser, not show an empty white sheet.
   */
  it('says so when the book cannot be fetched, and offers the browser', async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error('network down')) });
    render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(screen.getByText(/Check your connection|Tarkista verkkoyhteys/)).toBeInTheDocument());
    expect(screen.getAllByText(/Open in browser|Avaa selaimessa/).length).toBeGreaterThan(0);
  });

  it('does not treat a cancelled render as an error', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' });
    renderPage.mockReturnValue({ promise: Promise.reject(cancelled), cancel: jest.fn() });
    render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalled());
    expect(screen.queryByText(/Tarkista verkkoyhteys/)).not.toBeInTheDocument();
  });

  /**
   * @critical - pdf.js holds a worker and the fetched page data. Dropping the
   * reference without destroy() leaves both alive, so opening a few laws on a
   * phone accumulates workers - the exact cost this feature avoids everywhere
   * else.
   */
  it('destroys the document when closed, so the worker does not leak', async () => {
    const { rerender } = render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    expect(destroy).not.toHaveBeenCalled();

    rerender(<RuleViewerModal {...props} isOpen={false} />);
    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });

  /**
   * @critical - the same leak in its narrowest window. release() runs on close
   * and finds nothing, because the document has not resolved yet; when it does,
   * nothing holds it and nothing would ever destroy it.
   */
  it('destroys a document that arrives after the sheet was closed', async () => {
    type Doc = { numPages: number; getPage: typeof getPage; destroy: typeof destroy };
    let resolveDoc: (d: Doc) => void = () => {};
    getDocument.mockReturnValue({
      promise: new Promise<Doc>((res) => {
        resolveDoc = res;
      }),
    });

    const { rerender } = render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());

    // Closed while the first fetch is still in flight.
    rerender(<RuleViewerModal {...props} isOpen={false} />);
    resolveDoc({ numPages: 139, getPage, destroy });

    await waitFor(() => expect(destroy).toHaveBeenCalled());
    // It must not have been rendered either.
    expect(getPage).not.toHaveBeenCalled();
  });

  it('destroys the document on unmount too', async () => {
    const { unmount } = render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    unmount();
    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });

  /**
   * Reopening at a different law lands on that law, never on the page the
   * reader left off at.
   *
   * NOTE ON WHAT THIS DOES AND DOES NOT PROVE: it passes with either the
   * adjust-during-render reset or the older effect-based one, because the
   * loading effect's `cancelled` guard already stops a stale fetch reaching
   * getPage - the dynamic import gives the state update time to land first.
   * The reset was still moved into render, since that never schedules the
   * stale load at all rather than relying on a race resolving favourably. So
   * this is a behaviour guard, not a regression test for that change.
   */
  it('lands on the requested law when reopened, not the page left off at', async () => {
    const { rerender } = render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    fireEvent.click(screen.getByTestId('rule-viewer-next'));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(66));

    rerender(<RuleViewerModal {...props} isOpen={false} />);
    getPage.mockClear();
    rerender(<RuleViewerModal {...props} isOpen page={83} />);

    await waitFor(() => expect(getPage).toHaveBeenCalledWith(83));
    // 66 was where the reader left off; it must never be requested again.
    expect(getPage.mock.calls.map((c) => c[0])).not.toContain(66);
  });

  /**
   * @edge-case - a phone turned sideways otherwise keeps the page drawn at the
   * old width until the reader pages away and back.
   */
  it('re-renders the page when the window resizes', async () => {
    jest.useFakeTimers();
    try {
      render(<RuleViewerModal {...props} isOpen />);
      await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
      getPage.mockClear();

      window.dispatchEvent(new Event('resize'));
      jest.advanceTimersByTime(200); // debounced
      await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
      // Same document: a resize must not re-download the book.
      expect(getDocument).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('goes back to the requested law each time it is reopened', async () => {
    const { rerender } = render(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    fireEvent.click(screen.getByTestId('rule-viewer-next'));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(66));

    rerender(<RuleViewerModal {...props} isOpen={false} />);
    rerender(<RuleViewerModal {...props} isOpen />);
    await waitFor(() => expect(screen.getByText(/Sivu 65/)).toBeInTheDocument());
  });
});
