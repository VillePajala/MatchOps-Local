'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleModalHeader, modalContainerStyle, ModalBackgroundEffects } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { withPage } from '@/config/rulesIndex';

/**
 * Reads one page of an official rulebook, in the app.
 *
 * WHY THIS EXISTS: the index gives a law and a page, and the obvious link
 * (`...pdf#page=65`) only works in a desktop PDF viewer. On Android the book
 * opens at page 1, so the page number was information the coach had to act on
 * by hand - which is what the owner reported. This lands on the page.
 *
 * WHAT IT IS NOT: a copy. The file is fetched from the publisher's own public
 * URL, at the coach's request, and never stored or served by us - the app is
 * acting as a reader, the way a browser does. Nothing about the rulebook is
 * bundled; see rulesIndex.ts for why that matters.
 *
 * The fetch uses byte ranges (the hosts send accept-ranges: bytes), so opening
 * one law pulls a few pages rather than a 3MB book - which matters when a coach
 * does this on mobile data at the side of a pitch.
 */
interface RuleViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The rulebook URL, without a page fragment. */
  url: string | null;
  /** 1-based page to open at. */
  page: number;
  /** What the reader tapped, shown in the header. */
  title: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

const RuleViewerModal: React.FC<RuleViewerModalProps> = ({ isOpen, onClose, url, page, title }) => {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  // The loaded document, kept so paging does not re-download it.
  const docRef = React.useRef<{
    numPages: number;
    getPage: (n: number) => Promise<unknown>;
    destroy: () => Promise<void>;
  } | null>(null);
  const renderTaskRef = React.useRef<{ cancel: () => void } | null>(null);

  const [status, setStatus] = React.useState<Status>('idle');
  const [current, setCurrent] = React.useState(page);
  const [total, setTotal] = React.useState(0);
  /** Bumped on resize so the page re-renders at the new width. */
  const [resizeTick, setResizeTick] = React.useState(0);

  /**
   * A fresh open starts at the law the coach tapped, even if they paged away
   * last time; the page is the whole point of opening it.
   *
   * Adjusted DURING render, not in an effect: an effect runs after the loading
   * effect has already fired for the previous page, so the viewer would fetch
   * and render the stale page and then correct itself - a visible flicker and a
   * wasted range request on mobile data. (Sanctioned adjust-during-render, the
   * same pattern the friendly toggle uses in GameSettingsModal.)
   */
  const [prevOpen, setPrevOpen] = React.useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (isOpen) setCurrent(page);
  }

  React.useEffect(() => {
    if (!isOpen || !url) return;
    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        // Dynamic: pdf.js is ~450KB and only a coach who opens a law needs it.
        const pdfjs = await import('pdfjs-dist');
        // Same-origin worker: the CSP is worker-src 'self' blob:, and the file
        // is copied from the installed pdfjs-dist at build time so the worker
        // and the library can never be different versions.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        if (!docRef.current) {
          const doc = await pdfjs.getDocument({
            url,
            // Range requests: pull the pages being read, not the whole book.
            disableRange: false,
            disableStream: false,
            disableAutoFetch: true,
          }).promise;
          // Closing while the first fetch is in flight is the narrow version of
          // the same leak: release() has already run and found nothing, so this
          // document would never be reachable again and never destroyed.
          if (cancelled) {
            await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
            return;
          }
          docRef.current = doc as unknown as typeof docRef.current;
          setTotal(doc.numPages);
        }

        const doc = docRef.current;
        if (!doc) return;
        const clamped = Math.min(Math.max(1, current), doc.numPages);
        const pdfPage = (await doc.getPage(clamped)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void>; cancel: () => void };
        };
        if (cancelled) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Fit the width we have, and respect device pixel ratio so the text is
        // legible rather than a blurry upscale on a phone.
        const available = (wrapRef.current?.clientWidth ?? 320) - 8;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.max(0.2, available / base.width);
        const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: scale * dpr });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setStatus('ready');
      } catch (err) {
        // A cancelled render is normal when paging quickly; it is not an error
        // the coach should ever see.
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
        if (!cancelled) {
          logger.warn('[RuleViewerModal] could not render the rulebook page', err);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, url, current, resizeTick]);

  /**
   * Release the document when the sheet closes.
   *
   * destroy() is the part that matters: pdf.js holds a worker and the fetched
   * page data, and dropping the reference alone leaves both alive. On a phone,
   * opening a few laws would then accumulate workers - the exact resource cost
   * this feature was careful to avoid everywhere else.
   */
  const release = React.useCallback(() => {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    const doc = docRef.current;
    docRef.current = null;
    doc?.destroy?.().catch(() => {
      /* already gone; nothing to do */
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      release();
      setTotal(0);
      setStatus('idle');
    }
  }, [isOpen, release]);

  // A different book is a different document.
  React.useEffect(() => {
    release();
  }, [url, release]);

  // Unmount must not leak either.
  React.useEffect(() => () => release(), [release]);

  // Orientation change on a phone otherwise leaves the page rendered at the old
  // width until the reader pages away and back.
  React.useEffect(() => {
    if (!isOpen) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setResizeTick((n) => n + 1), 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const openInBrowser = () => {
    const href = withPage(url, current);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[85] font-display flex" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        <ModalBackgroundEffects />
        <div className="relative z-10 flex flex-col h-full min-h-0">
          <CollapsibleModalHeader title={title} onClose={onClose} closeLabel={t('common.close', 'Close')}>
            <p className="text-xs text-slate-400 px-6 pb-3 text-center">
              {t('ruleViewer.subtitle', 'Virallinen sääntökirja. Sivu {{n}}{{total}}.', {
                n: current,
                total: total ? `/${total}` : '',
              })}
            </p>
          </CollapsibleModalHeader>

          <div ref={wrapRef} className="flex-1 min-h-0 overflow-auto px-1 py-2 flex justify-center">
            {status === 'error' ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-sm text-slate-300">
                  {t('ruleViewer.error', 'Sääntökirjaa ei saatu auki. Tarkista verkkoyhteys.')}
                </p>
                <button
                  type="button"
                  onClick={openInBrowser}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  {t('ruleViewer.openInBrowser', 'Avaa selaimessa')}
                </button>
              </div>
            ) : (
              <>
                {status !== 'ready' && (
                  <p className="absolute top-1/2 text-sm text-slate-400" data-testid="rule-viewer-loading">
                    {t('ruleViewer.loading', 'Ladataan sivua...')}
                  </p>
                )}
                <canvas ref={canvasRef} data-testid="rule-viewer-canvas" className="max-w-full" />
              </>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-700/60">
            <button
              type="button"
              onClick={() => setCurrent((p) => Math.max(1, p - 1))}
              disabled={current <= 1 || status === 'error'}
              data-testid="rule-viewer-prev"
              className="px-4 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 disabled:opacity-40"
            >
              {t('ruleViewer.prev', 'Edellinen')}
            </button>
            <button
              type="button"
              onClick={openInBrowser}
              className="px-3 py-2 rounded-md text-xs text-slate-300 hover:text-white"
            >
              {t('ruleViewer.openInBrowser', 'Avaa selaimessa')}
            </button>
            <button
              type="button"
              onClick={() => setCurrent((p) => (total ? Math.min(total, p + 1) : p + 1))}
              disabled={(total > 0 && current >= total) || status === 'error'}
              data-testid="rule-viewer-next"
              className="px-4 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 disabled:opacity-40"
            >
              {t('ruleViewer.next', 'Seuraava')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RuleViewerModal;
