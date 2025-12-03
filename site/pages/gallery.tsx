import Layout from '@/components/Layout';
import Head from 'next/head';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

const screenshots = [
  // Original (Oct 27)
  { src: '/screenshots/Screenshot 2025-08-01 213624.png', alt: '1. App main view' },
  { src: '/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png', alt: '2. App in use' },
  { src: '/screenshots/StatsModalappInHandAtSoccerField.png', alt: '3. Stats view at the field' },
  { src: '/screenshots/ChatGPT Image Oct 27, 2025, 06_56_55 PM.png', alt: '4. App view' },
  { src: '/screenshots/Screenshot 2025-10-27 190449.png', alt: '5. Screenshot' },
  // New (Dec 1)
  { src: '/screenshots/Screenshot 2025-12-01 142839.png', alt: '6. Screenshot' },
  { src: '/screenshots/Screenshot 2025-12-01 230546.png', alt: '7. Screenshot' },
  { src: '/screenshots/Screenshot 2025-12-01 231924.png', alt: '8. Screenshot' },
  // New (Dec 3)
  { src: '/screenshots/Screenshot 2025-12-03 114244.png', alt: '9. Screenshot' },
  // Gemini generated (Dec 3)
  { src: '/screenshots/Gemini_Generated_Image_sguqf5sguqf5sguq.png', alt: '10. Generated image' },
  { src: '/screenshots/Gemini_Generated_Image_yygjmoyygjmoyygj.png', alt: '11. Generated image' },
  { src: '/screenshots/Gemini_Generated_Image_5zqp3v5zqp3v5zqp.png', alt: '12. Generated image' },
];

export default function GalleryPage() {
  const { t } = useTranslation('common');
  const [lightbox, setLightbox] = useState<null | { src: string; alt: string }>(null);

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
                  onClick={() => setLightbox(screenshot)}
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

      {/* Lightbox Modal */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('screenshots.aria.preview')}
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-screen-lg w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-slate-900 border border-slate-700 text-white shadow hover:bg-slate-800 z-10"
              aria-label={t('screenshots.aria.close')}
              onClick={() => setLightbox(null)}
            >
              ×
            </button>
            <button
              type="button"
              aria-label={t('screenshots.aria.close')}
              onClick={() => setLightbox(null)}
              className="max-h-[85vh] w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900/40 cursor-zoom-out"
            >
              <Image
                src={lightbox.src}
                alt={lightbox.alt}
                width={1024}
                height={1536}
                sizes="(min-width: 1024px) 70vw, 90vw"
                className="block mx-auto h-auto w-auto max-w-full max-h-[85vh]"
              />
            </button>
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
