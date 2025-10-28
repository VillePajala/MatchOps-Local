import Layout from '@/components/Layout';
import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
// Polished lists now use CSS-based checkmarks via .list-checked
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function HomePage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const mobileCarouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightbox, setLightbox] = useState<null | { src: string; alt: string }>(null);

  useEffect(() => {
    const container = mobileCarouselRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    let raf: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most visible item
        const mostVisible = entries
          .slice()
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const index = items.indexOf(mostVisible.target as HTMLElement);
        if (index >= 0) {
          // Throttle state updates with rAF to avoid jank on scroll
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => setActiveSlide(index));
        }
      },
      { root: container, threshold: [0.3, 0.6, 0.9] }
    );

    items.forEach((el) => observer.observe(el));
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const goTo = (index: number) => {
    const container = mobileCarouselRef.current;
    if (!container) return;
    const items = Array.from(container.children) as HTMLElement[];
    const el = items[index];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <Layout>
      <Head>
        <title>{t('seo.home.title')}</title>
        <meta name="description" content={t('seo.home.description')} />
        <meta property="og:title" content={t('seo.home.title')} />
        <meta property="og:description" content={t('seo.home.description')} />
        <meta property="og:url" content={`https://matchops-local.vercel.app${router.locale === 'en' ? '/en' : ''}`} />
      </Head>
      {/* What Is This? */}
      <section className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
              {t('info.whatIsThis.title')}
            </h1>
            <div className="prose prose-invert max-w-none">
              <p>
                {t('info.whatIsThis.description')}
              </p>
              <p>
                {t('info.whatIsThis.oneLine')}
              </p>
            </div>

            {/* Hero Screenshots: mobile carousel + desktop grid */}
            {/* Mobile: swipeable scroll-snap carousel */}
            <div className="md:hidden mt-8 -mx-4 relative">
              <div
                ref={mobileCarouselRef}
                className="flex overflow-x-auto snap-x snap-mandatory snap-always px-0 no-scrollbar"
                role="region"
                aria-label={t('screenshots.aria.carousel')}
                aria-roledescription="carousel"
              >
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start">
                  <Image
                    src="/screenshots/Screenshot 2025-08-01 213624.png"
                    alt="App view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-full h-auto"
                    priority
                  />
                </div>
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start">
                  <Image
                    src="/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png"
                    alt="Detail view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-full h-auto"
                  />
                </div>
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start">
                  <Image
                    src="/screenshots/StatsModalappInHandAtSoccerField.png"
                    alt="MatchOps Local in use at the field"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-full h-auto"
                  />
                </div>
              </div>

              {/* Carousel controls */}
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-1 pointer-events-none">
                <button
                  type="button"
                  aria-label={t('screenshots.aria.prev')}
                  className="pointer-events-auto h-8 w-8 rounded-full bg-slate-900/60 border border-slate-700 text-white grid place-items-center shadow hover:bg-slate-800/70"
                  onClick={() => goTo(Math.max(0, activeSlide - 1))}
                >
                  <span aria-hidden>‹</span>
                </button>
                <button
                  type="button"
                  aria-label={t('screenshots.aria.next')}
                  className="pointer-events-auto h-8 w-8 rounded-full bg-slate-900/60 border border-slate-700 text-white grid place-items-center shadow hover:bg-slate-800/70"
                  onClick={() => goTo(Math.min(2, activeSlide + 1))}
                >
                  <span aria-hidden>›</span>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                {[t('screenshots.labels.plan'), t('screenshots.labels.track'), t('screenshots.labels.review')].map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={t('screenshots.aria.goTo', { label })}
                    className={`px-2 py-1 text-xs rounded-full border ${
                      activeSlide === i
                        ? 'border-primary text-white bg-primary/20'
                        : 'border-slate-600 text-slate-300 bg-slate-800/60 hover:bg-slate-800'
                    }`}
                    onClick={() => goTo(i)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop/Tablet: compact 3-up grid */}
            <div className="hidden md:grid grid-cols-3 gap-6 mt-8 mx-auto max-w-4xl lg:max-w-5xl">
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left"
                  onClick={() => setLightbox({ src: '/screenshots/Screenshot 2025-08-01 213624.png', alt: 'App view screenshot' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.plan') })}
                >
                  <Image
                    src="/screenshots/Screenshot 2025-08-01 213624.png"
                    alt="App view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="w-full h-auto"
                    priority
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.plan')}</p>
              </div>
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left"
                  onClick={() => setLightbox({ src: '/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png', alt: 'Detail view screenshot' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.track') })}
                >
                  <Image
                    src="/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png"
                    alt="Detail view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="w-full h-auto"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.track')}</p>
              </div>
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left"
                  onClick={() => setLightbox({ src: '/screenshots/StatsModalappInHandAtSoccerField.png', alt: 'MatchOps Local in use at the field' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.review') })}
                >
                  <Image
                    src="/screenshots/StatsModalappInHandAtSoccerField.png"
                    alt="MatchOps Local in use at the field"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="w-full h-auto"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.review')}</p>
              </div>
            </div>

            {/* Desktop Lightbox Modal */}
            {lightbox && (
              <div
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-label={t('screenshots.aria.preview')}
                onClick={() => setLightbox(null)}
              >
                <div className="relative max-w-screen-lg w-full" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-slate-900 border border-slate-700 text-white shadow hover:bg-slate-800"
                    aria-label={t('screenshots.aria.close')}
                    onClick={() => setLightbox(null)}
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    aria-label="Close preview"
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

            {/* Removed Plan → Track → Review card band per request */}
          </div>
        </div>
      </section>

      {/* The Coach's Challenge */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.challenges.title')}
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge1')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge2')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge3')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge4')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge5')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge6')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Can Do */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-12">
              {t('info.whatYouCanDo.title')}
            </h2>

            {/* Before the Game */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-primary mb-4">
                {t('info.whatYouCanDo.beforeGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.beforeGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item4')}</span></li>
              </ul>
            </div>

            {/* During the Game */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-indigo-400 mb-4">
                {t('info.whatYouCanDo.duringGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.duringGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item4')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item5')}</span></li>
              </ul>
            </div>

            {/* After the Game */}
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-4">
                {t('info.whatYouCanDo.afterGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.afterGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item4')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item5')}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Details */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              {t('info.technical.title')}
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-lg text-slate-200 mb-4">{t('info.technical.desc1')}</p>
              <p className="text-lg text-slate-200 mb-4">{t('info.technical.desc2')}</p>
              <p className="text-lg text-slate-200">{t('info.technical.desc3')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Common Questions */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.faq.title')}
            </h2>
            <div className="space-y-4 prose prose-invert max-w-none">
              {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const).map((key) => (
                <details key={key} className="group rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                  <summary className="cursor-pointer list-none text-white font-semibold">
                    {t(`info.faq.${key}`)}
                  </summary>
                  <div className="mt-2 text-slate-300">
                    {t(`info.faq.a${key.slice(1)}`)}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Limited Testing Notice */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-white">
              {t('info.cta.title')}
            </h3>
          </div>
        </div>
      </section>
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
