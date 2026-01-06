'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

interface ScreenshotProps {
  src: string;
  alt: string;
  caption?: string;
  captionFi?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export default function Screenshot({
  src,
  alt,
  caption,
  captionFi,
  width = 800,
  height = 600,
  priority = false,
}: ScreenshotProps) {
  const { locale } = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const displayCaption = locale === 'fi' && captionFi ? captionFi : caption;

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };

    window.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeLightbox]);

  return (
    <>
      {/* Screenshot thumbnail */}
      <figure className="my-6">
        <button
          type="button"
          className="block w-full cursor-zoom-in group"
          onClick={() => setIsOpen(true)}
          aria-label={`Enlarge: ${alt}`}
        >
          <div className="relative overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40 transition-all group-hover:border-slate-600 group-hover:shadow-lg">
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              priority={priority}
              sizes="(max-width: 768px) 100vw, 800px"
              className="w-full h-auto"
            />
            <span className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
            {/* Zoom icon indicator */}
            <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              Click to enlarge
            </span>
          </div>
        </button>
        {displayCaption && (
          <figcaption className="mt-2 text-sm text-slate-400 text-center italic">
            {displayCaption}
          </figcaption>
        )}
      </figure>

      {/* Lightbox Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-slate-800/80 border border-slate-600 text-white text-xl hover:bg-slate-700 transition-colors z-20"
            aria-label="Close"
            onClick={closeLightbox}
          >
            ×
          </button>

          {/* Image container */}
          <div
            className="relative max-w-screen-lg w-full px-4 md:px-8"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={src}
              alt={alt}
              width={1200}
              height={900}
              sizes="(min-width: 1024px) 80vw, 95vw"
              className="block mx-auto w-full md:w-auto md:max-w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            {displayCaption && (
              <p className="mt-4 text-center text-slate-300 text-sm">
                {displayCaption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
