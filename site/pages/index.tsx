import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
// Polished lists now use CSS-based checkmarks via .list-checked
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import { FaFutbol, FaClock, FaPencilAlt, FaChartLine, FaTrophy, FaUsers, FaBolt, FaShieldAlt, FaDatabase, FaGlobe } from 'react-icons/fa';

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
        <meta property="og:url" content={`https://www.match-ops.com${router.locale === 'en' ? '/en' : ''}`} />
        <meta property="og:image" content="https://www.match-ops.com/screenshots/OG.png" />
      </Head>
      {/* What Is This? */}
      <section className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            {/* Title with highlight */}
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
              {router.locale === 'fi' ? (
                <>Mikä on <span className="text-primary">MatchOps Local</span>?</>
              ) : (
                <>What is <span className="text-primary">MatchOps Local</span>?</>
              )}
            </h1>

            {/* Main description */}
            <p className="text-slate-200 text-lg md:text-xl leading-relaxed mb-6">
              {t('info.whatIsThis.description')}
            </p>

            {/* Badge-style highlights */}
            <div className="flex flex-wrap justify-center gap-3 mt-8 mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700/50">
                <FaShieldAlt className="text-primary text-sm flex-shrink-0" />
                <span className="text-slate-300 text-sm md:text-base">
                  {router.locale === 'fi' ? 'Ei rekisteröitymistä' : 'No signup required'}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700/50">
                <FaDatabase className="text-primary text-sm flex-shrink-0" />
                <span className="text-slate-300 text-sm md:text-base">
                  {router.locale === 'fi' ? 'Tietosi pysyvät laitteellasi' : 'Your data stays on your device'}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700/50">
                <FaBolt className="text-primary text-sm flex-shrink-0" />
                <span className="text-slate-300 text-sm md:text-base">
                  {router.locale === 'fi' ? 'Toimii ilman nettiä' : 'Works offline'}
                </span>
              </div>
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
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start flex items-center justify-center">
                  <Image
                    src="/screenshots/the first screenshot.png"
                    alt="App view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-auto h-auto max-h-[70vh] object-contain"
                    priority
                  />
                </div>
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start flex items-center justify-center">
                  <Image
                    src="/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png"
                    alt="Detail view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-auto h-auto max-h-[70vh] object-contain"
                  />
                </div>
                <div className="screenshot-frame relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start flex items-center justify-center">
                  <Image
                    src="/screenshots/StatsModalappInHandAtSoccerField.png"
                    alt="MatchOps Local in use at the field"
                    width={1024}
                    height={1536}
                    sizes="(max-width: 768px) 100vw, 288px"
                    className="w-auto h-auto max-h-[70vh] object-contain"
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
              <div className="text-center mt-6">
                <Link
                  href="/gallery"
                  className="inline-block px-6 py-3 bg-primary hover:bg-primary/90 text-slate-900 font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
                >
                  {t('screenshots.viewMore')} →
                </Link>
              </div>
            </div>

            {/* Desktop/Tablet: compact 3-up grid */}
            <div className="hidden md:grid grid-cols-3 gap-6 mt-8 mx-auto max-w-4xl lg:max-w-5xl items-end">
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left overflow-hidden aspect-[2/3] bg-slate-800/40 flex items-center justify-center"
                  onClick={() => setLightbox({ src: '/screenshots/the first screenshot.png', alt: 'App view screenshot' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.plan') })}
                >
                  <Image
                    src="/screenshots/the first screenshot.png"
                    alt="App view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="h-full w-full object-contain"
                    priority
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.plan')}</p>
              </div>
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left overflow-hidden aspect-[2/3] bg-slate-800/40 flex items-center justify-center"
                  onClick={() => setLightbox({ src: '/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png', alt: 'Detail view screenshot' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.track') })}
                >
                  <Image
                    src="/screenshots/ChatGPT Image Oct 27, 2025, 07_15_53 PM.png"
                    alt="Detail view screenshot"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="h-full w-full object-contain"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.track')}</p>
              </div>
              <div>
                <button
                  type="button"
                  className="screenshot-frame relative group cursor-zoom-in w-full text-left overflow-hidden aspect-[2/3] bg-slate-800/40 flex items-center justify-center"
                  onClick={() => setLightbox({ src: '/screenshots/StatsModalappInHandAtSoccerField.png', alt: 'MatchOps Local in use at the field' })}
                  aria-label={t('screenshots.aria.enlarge', { label: t('screenshots.labels.review') })}
                >
                  <Image
                    src="/screenshots/StatsModalappInHandAtSoccerField.png"
                    alt="MatchOps Local in use at the field"
                    width={1024}
                    height={1536}
                    sizes="(min-width: 1024px) 320px, 30vw"
                    className="h-full w-full object-contain"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition" />
                </button>
                <p className="text-center text-sm text-slate-400 mt-2">{t('screenshots.captions.review')}</p>
              </div>
            </div>

            {/* View more button */}
            <div className="hidden md:block text-center mt-8">
              <Link
                href="/gallery"
                className="inline-block px-8 py-3 bg-primary hover:bg-primary/90 text-slate-900 font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
              >
                {t('screenshots.viewMore')} →
              </Link>
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

      {/* The Coach's Challenge - HIDDEN */}
      {false && (
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
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge7')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Section 1: Your Game Day Toolkit */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
              {t('features.gameDay.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                icon={<FaFutbol />}
                title={t('features.gameDay.field.title')}
                description={t('features.gameDay.field.desc')}
              />
              <FeatureCard
                icon={<FaClock />}
                title={t('features.gameDay.timer.title')}
                description={t('features.gameDay.timer.desc')}
              />
              <FeatureCard
                icon={<FaPencilAlt />}
                title={t('features.gameDay.tactics.title')}
                description={t('features.gameDay.tactics.desc')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Beyond the Match */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
              {t('features.management.title')}
            </h2>
            <div className="mb-6">
              <FeatureCard
                icon={<FaChartLine />}
                title={t('features.management.analytics.title')}
                description={t('features.management.analytics.desc')}
                variant="wide"
                highlights={[
                  t('features.management.analytics.h1'),
                  t('features.management.analytics.h2'),
                  t('features.management.analytics.h3'),
                  t('features.management.analytics.h4'),
                  t('features.management.analytics.h5'),
                  t('features.management.analytics.h6'),
                ]}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                icon={<FaTrophy />}
                title={t('features.management.seasons.title')}
                description={t('features.management.seasons.desc')}
              />
              <FeatureCard
                icon={<FaUsers />}
                title={t('features.management.team.title')}
                description={t('features.management.team.desc')}
              />
              <FeatureCard
                icon={<FaDatabase />}
                title={t('features.management.data.title')}
                description={t('features.management.data.desc')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Built Different */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
              {t('features.foundation.title')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <FeatureCard
                icon={<FaBolt />}
                title={t('features.foundation.offline.title')}
                description={t('features.foundation.offline.desc')}
              />
              <FeatureCard
                icon={<FaShieldAlt />}
                title={t('features.foundation.private.title')}
                description={t('features.foundation.private.desc')}
              />
              <FeatureCard
                icon={<FaDatabase />}
                title={t('features.foundation.backup.title')}
                description={t('features.foundation.backup.desc')}
              />
              <FeatureCard
                icon={<FaGlobe />}
                title={t('features.foundation.i18n.title')}
                description={t('features.foundation.i18n.desc')}
              />
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
              {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const).map((key) => (
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
