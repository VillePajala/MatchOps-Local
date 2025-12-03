import Layout from '@/components/Layout';
import Head from 'next/head';
import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

const screenshots = [
  // Prioritized images first
  { src: '/screenshots/Screenshot 2025-12-01 142839.png', alt: '1. Screenshot' },
  { src: '/screenshots/Screenshot 2025-12-01 230546.png', alt: '2. Screenshot' },
  { src: '/screenshots/Screenshot 2025-10-27 190449.png', alt: '3. Screenshot' },
  { src: '/screenshots/Gemini_Generated_Image_yygjmoyygjmoyygj.png', alt: '4. Generated image' },
  // App screenshots
  { src: '/screenshots/Screenshot 2025-08-01 213624.png', alt: '5. App main view' },
  { src: '/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png', alt: '6. App in use' },
  { src: '/screenshots/StatsModalappInHandAtSoccerField.png', alt: '7. Stats view at the field' },
  { src: '/screenshots/ChatGPT Image Oct 27, 2025, 06_56_55 PM.png', alt: '8. App view' },
  { src: '/screenshots/ChatGPT Image Oct 27, 2025, 07_12_08 PM.png', alt: '9. App detail view' },
  // October screenshots
  { src: '/screenshots/Screenshot 2025-10-27 185158.png', alt: '10. Screenshot' },
  { src: '/screenshots/Screenshot 2025-10-27 185632.png', alt: '11. Screenshot' },
];

export default function GalleryPage() {
  const { t } = useTranslation('common');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const goNext = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % screenshots.length);
    }
  }, [lightboxIndex]);

  const goPrev = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + screenshots.length) % screenshots.length);
    }
  }, [lightboxIndex]);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, goNext, goPrev, closeLightbox]);

  const currentImage = lightboxIndex !== null ? screenshots[lightboxIndex] : null;

  return (
    <Layout>
      <Head>
        <title>{t('screenshots.gallery.title')} - MatchOps Local</title>
      </Head>

      <section className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 text-center">
              {t('screenshots.gallery.title')}
            </h1>
            <p className="text-slate-300 text-center mb-8">
              {t('screenshots.gallery.subtitle')}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {screenshots.map((screenshot, index) => (
                <button
                  key={index}
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in rounded-lg overflow-hidden border border-slate-700/40 bg-slate-800/40"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={t('screenshots.aria.enlarge', { label: screenshot.alt })}
                >
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={400}
                    height={600}
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="w-full h-auto"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
                  <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-xs font-bold px-2 py-1 rounded">
                    {index + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Lightbox Modal with Navigation */}
      {currentImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t('screenshots.aria.preview')}
          onClick={closeLightbox}
        >
          {/* Previous button */}
          <button
            type="button"
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white text-2xl hover:bg-slate-700 transition-colors z-20"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
          >
            ‹
          </button>

          {/* Next button */}
          <button
            type="button"
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-slate-800/80 border border-slate-600 text-white text-2xl hover:bg-slate-700 transition-colors z-20"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            ›
          </button>

          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-slate-800/80 border border-slate-600 text-white text-xl hover:bg-slate-700 transition-colors z-20"
            aria-label={t('screenshots.aria.close')}
            onClick={closeLightbox}
          >
            ×
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 bg-slate-800/80 border border-slate-600 text-white text-sm px-3 py-1 rounded-full z-20">
            {lightboxIndex !== null ? lightboxIndex + 1 : 0} / {screenshots.length}
          </div>

          {/* Image */}
          <div
            className="relative max-w-screen-lg w-full px-4 md:px-20"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={currentImage.src}
              alt={currentImage.alt}
              width={1024}
              height={1536}
              sizes="(min-width: 1024px) 70vw, 95vw"
              className="block mx-auto w-full md:w-auto md:max-w-full h-auto max-h-[90vh] md:max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
  };
};
