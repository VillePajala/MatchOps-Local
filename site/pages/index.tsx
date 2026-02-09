import Layout from '@/components/Layout';
import { PhoneMockup, GlowBg } from '@/components/marketing';
import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import { FaArrowUp } from 'react-icons/fa';

// Language-aware screenshot paths (matches marketing-assets.tsx)
const getScreenshots = (locale: string | undefined) => {
  const isEnglish = locale === 'en';
  return {
    // Main hero screenshots
    soccerfield: '/screenshots/MatchOps_main_soccerfield_new_en_fi.jpg',
    timer: isEnglish
      ? '/screenshots/MatchOps_main_timer_en.jpg'
      : '/screenshots/MatchOps_Main_timer_full.jpg',
    playerstats: isEnglish
      ? '/screenshots/MatchOps_main_playerstatistics_en.jpg'
      : '/screenshots/MatchOps_Main_playerstats_full.jpg',
    // Feature card screenshots
    tacticalBoard: '/screenshots/MatcOps_main_tacticaldrawingstate_fi_en.jpg',
    formations: isEnglish
      ? '/screenshots/MatcOps_main_formationsmodal_en.jpg'
      : '/screenshots/MatchOps_main_formationsmodal_fi.jpg',
    roster: isEnglish
      ? '/screenshots/MatcOps_main_masterrostermodal_en.jpg'
      : '/screenshots/MatcOps_main_mainrostermodal_fi.jpg',
    assessment: isEnglish
      ? '/screenshots/MatcOps_main_playerassesments_en.jpg'
      : '/screenshots/MatchOps_main_playerassesments_fi.jpg',
    trends: isEnglish
      ? '/screenshots/MatchOps_main_playerstatprogression_en.jpg'
      : '/screenshots/MatchOps_main_playerstatsprogression_fi.jpg',
    seasons: isEnglish
      ? '/screenshots/MatcOps_main_seasoncreationmodal_en.jpg'
      : '/screenshots/MatchOps_main_seasoncreationmodal_fi.jpg',
    tournaments: isEnglish
      ? '/screenshots/MatcOps_main_tournamentcreationmodal_en.jpg'
      : '/screenshots/MatchOps_main_tournamentcreationmodel_fi.jpg',
    teams: isEnglish
      ? '/screenshots/MatcOps_main_teamcreatiommodal_en.jpg'
      : '/screenshots/MatchOps_main_teamcreatingmodal_fi.jpg',
    archive: isEnglish
      ? '/screenshots/MatcOps_main_savedgames_en.jpg'
      : '/screenshots/MatchOps_main_savedgames_fi.jpg',
    goalTimeline: isEnglish
      ? '/screenshots/MatchOps_main_goallogs_en.jpg'
      : '/screenshots/MatchOps_main_goallogs_fi.jpg',
    excelExport: isEnglish
      ? '/screenshots/MatcOps_main_excelexport_en.jpg'
      : '/screenshots/MatchOps_main_excelexport_fi.jpg',
    personnel: isEnglish
      ? '/screenshots/MatcOps_main_personnel_en.jpg'
      : '/screenshots/MatchOps_main_personnel_fi.jpg',
    futsal: '/screenshots/MatchOps_main_futsal_new_en_fi.jpg',
    officialRules: isEnglish
      ? '/screenshots/MatchOps_main_rules_en.jpg'
      : '/screenshots/MatchOps_main_rules_fi.jpg',
    cloudSync: isEnglish
      ? '/screenshots/MatchOps_main_cloudSync_en.jpg'
      : '/screenshots/MatchOps_main_CloudSync_fi.jpg',
  };
};

export default function HomePage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const screenshots = getScreenshots(router.locale);
  const mobileCarouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightbox, setLightbox] = useState<null | { src: string; alt: string }>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const isEnglish = router.locale === 'en';

  // Mobile carousel labels (5 items now)
  const carouselLabels = isEnglish
    ? ['Lineup', 'Timer', 'Stats', 'Tactics', 'Events']
    : ['Kenttä', 'Ajastin', 'Tilastot', 'Taktiikka', 'Loki'];

  useEffect(() => {
    const container = mobileCarouselRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    // Track visibility ratios for all items
    const visibilityMap = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        // Update visibility map
        entries.forEach((entry) => {
          visibilityMap.set(entry.target, entry.intersectionRatio);
        });

        // Find the most visible item
        let maxRatio = 0;
        let maxIndex = -1;
        items.forEach((item, index) => {
          const ratio = visibilityMap.get(item) || 0;
          if (ratio > maxRatio) {
            maxRatio = ratio;
            maxIndex = index;
          }
        });

        // Only update if we have a clear winner (> 50% visible)
        if (maxIndex >= 0 && maxRatio > 0.5) {
          setActiveSlide(maxIndex);
        }
      },
      { root: container, threshold: [0.5] }
    );

    items.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
    };
  }, []);

  const goTo = (index: number) => {
    setActiveSlide(index); // Update immediately on click
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

  // Back to top button visibility
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

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

      {/* ===== HERO SECTION ===== */}
      <section className="section bg-slate-900 relative overflow-hidden">
        {/* Ambient glow effects - subtle */}
        <div className="hidden md:block">
          <GlowBg color="primary" position="top-right" size="md" blur={150} />
          <GlowBg color="amber" position="bottom-left" size="sm" blur={130} />
        </div>

        <div className="container-custom relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Bold tagline */}
            <p className="text-sm md:text-base text-slate-400 uppercase tracking-wider mb-3">
              {t('marketing.cards.forCoaches')}
            </p>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
              <span className="text-primary">MatchOps</span>
            </h1>
            <p className="text-xl md:text-2xl lg:text-3xl text-white mb-4">
              {t('marketing.taglines.power')}
            </p>
            <p className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold bg-primary/15 text-primary border border-primary/30 mb-8">
              {t('marketing.badges.cloudSync')}
            </p>

            {/* ===== 5-PHONE SHOWCASE ===== */}
            {/* Mobile: swipeable carousel */}
            <div className="md:hidden -mx-4 relative">
              <div
                ref={mobileCarouselRef}
                className="flex overflow-x-auto snap-x snap-mandatory snap-always px-0 py-8 no-scrollbar"
                role="region"
                aria-label={t('screenshots.aria.carousel')}
              >
                {[
                  { src: screenshots.soccerfield, alt: 'Lineup view' },
                  { src: screenshots.timer, alt: 'Timer view' },
                  { src: screenshots.playerstats, alt: 'Stats view' },
                  { src: screenshots.tacticalBoard, alt: 'Tactics view' },
                  { src: screenshots.goalTimeline, alt: 'Events view' },
                ].map((screen, i) => (
                  <div key={i} className="relative flex-shrink-0 w-[100vw] basis-[100vw] min-w-[100vw] snap-start flex items-center justify-center px-4">
                    <div className="phone-frame phone-frame-full">
                      <div className="phone-frame-screen">
                        <Image
                          src={screen.src}
                          alt={screen.alt}
                          width={1080}
                          height={2340}
                          sizes="(max-width: 768px) 50vw, 288px"
                          className="w-auto h-auto max-h-[65vh] object-contain"
                          priority={i < 2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Carousel controls */}
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-1 pointer-events-none">
                <button
                  type="button"
                  aria-label="Previous"
                  className="pointer-events-auto h-8 w-8 rounded-full bg-slate-900/60 border border-slate-700 text-white grid place-items-center shadow hover:bg-slate-800/70"
                  onClick={() => goTo(Math.max(0, activeSlide - 1))}
                >
                  <span aria-hidden>‹</span>
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className="pointer-events-auto h-8 w-8 rounded-full bg-slate-900/60 border border-slate-700 text-white grid place-items-center shadow hover:bg-slate-800/70"
                  onClick={() => goTo(Math.min(4, activeSlide + 1))}
                >
                  <span aria-hidden>›</span>
                </button>
              </div>

              {/* Pill navigation */}
              <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                {carouselLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      activeSlide === i
                        ? 'bg-primary text-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                    onClick={() => goTo(i)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop: 5-phone Arc layout */}
            <div className="hidden md:block mt-12 relative">
              <div className="relative flex items-center justify-center h-[500px]">
                {/* Phone 1: Tactical Board - far left */}
                <PhoneMockup
                  screenshot={screenshots.tacticalBoard}
                  size="md"
                  style={{
                    position: 'absolute',
                    left: '8%',
                    top: '48%',
                    transform: 'translateY(-50%) rotate(-8deg)',
                  }}
                  zIndex={1}
                />
                {/* Phone 2: Player Stats - left of center */}
                <PhoneMockup
                  screenshot={screenshots.playerstats}
                  size="lg"
                  style={{
                    position: 'absolute',
                    left: '22%',
                    top: '48%',
                    transform: 'translateY(-45%) rotate(-4deg)',
                  }}
                  zIndex={2}
                />
                {/* Phone 3: Soccer Field - CENTER (hero) */}
                <PhoneMockup
                  screenshot={screenshots.soccerfield}
                  size="xl"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '48%',
                    transform: 'translate(-50%, -45%)',
                  }}
                  zIndex={10}
                  priority
                />
                {/* Phone 4: Timer - right of center */}
                <PhoneMockup
                  screenshot={screenshots.timer}
                  size="lg"
                  style={{
                    position: 'absolute',
                    right: '22%',
                    top: '48%',
                    transform: 'translateY(-45%) rotate(4deg)',
                  }}
                  zIndex={2}
                />
                {/* Phone 5: Goal Timeline - far right */}
                <PhoneMockup
                  screenshot={screenshots.goalTimeline}
                  size="md"
                  style={{
                    position: 'absolute',
                    right: '8%',
                    top: '48%',
                    transform: 'translateY(-50%) rotate(8deg)',
                  }}
                  zIndex={1}
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ===== PLAN • TRACK • ASSESS ===== */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">
              {isEnglish ? 'Plan • Track • Assess' : 'Suunnittele • Seuraa • Arvioi'}
            </h2>
            <p className="text-slate-400 text-center mb-10 max-w-2xl mx-auto">
              {t('info.whatIsThis.description')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* PLAN */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <PhoneMockup screenshot={screenshots.soccerfield} size="lg" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  {isEnglish ? 'Plan' : 'Suunnittele'}
                </h3>
                <p className="text-slate-300">
                  {t('marketing.features.plan.desc')}
                </p>
              </div>
              {/* TRACK */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <PhoneMockup screenshot={screenshots.timer} size="lg" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  {isEnglish ? 'Track' : 'Seuraa'}
                </h3>
                <p className="text-slate-300">
                  {t('marketing.features.track.desc')}
                </p>
              </div>
              {/* ASSESS */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <PhoneMockup screenshot={screenshots.playerstats} size="lg" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  {isEnglish ? 'Assess' : 'Arvioi'}
                </h3>
                <p className="text-slate-300">
                  {t('marketing.features.assess.desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURE CARDS (14 features) ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-10 text-center">
              {isEnglish ? 'More Features' : 'Lisää ominaisuuksia'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { key: 'tacticalBoard', screenshot: screenshots.tacticalBoard },
                { key: 'cloudSync', screenshot: screenshots.cloudSync },
                { key: 'goalTimeline', screenshot: screenshots.goalTimeline },
                { key: 'formations', screenshot: screenshots.formations },
                { key: 'assessment', screenshot: screenshots.assessment },
                { key: 'trends', screenshot: screenshots.trends },
                { key: 'excelExport', screenshot: screenshots.excelExport },
                { key: 'roster', screenshot: screenshots.roster },
                { key: 'archive', screenshot: screenshots.archive },
                { key: 'teams', screenshot: screenshots.teams },
                { key: 'seasons', screenshot: screenshots.seasons },
                { key: 'tournaments', screenshot: screenshots.tournaments },
                { key: 'futsal', screenshot: screenshots.futsal },
                { key: 'personnel', screenshot: screenshots.personnel },
                { key: 'officialRules', screenshot: screenshots.officialRules },
              ].map((card, i) => (
                <div
                  key={card.key}
                  className={`bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-4 sm:p-6 md:p-8 flex gap-6 sm:gap-4 md:gap-6 ${
                    i % 2 === 0 ? 'flex-row' : 'flex-row-reverse'
                  }`}
                >
                  <div className="w-1/2 flex flex-col justify-center items-start">
                    <div className="text-primary text-xs sm:text-sm font-semibold mb-1 sm:mb-2">{t('marketing.ui.feature')}</div>
                    <h3 className="text-white text-lg sm:text-xl md:text-3xl font-bold mb-2 sm:mb-3">
                      {t(`marketing.featureCards.${card.key}`)}
                    </h3>
                    <p className="text-gray-400 text-sm sm:text-base">{t(`marketing.featureCards.${card.key}Desc`)}</p>
                  </div>
                  <div className="w-1/2 flex items-center justify-center">
                    <PhoneMockup screenshot={card.screenshot} size="lg" zIndex={10} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== TECH STATS ===== */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">
              {isEnglish ? 'Built Different' : 'Rakennettu eri tavalla'}
            </h2>
            <p className="text-slate-400 text-center mb-10 max-w-2xl mx-auto">
              {isEnglish
                ? 'Enterprise-grade quality with 4,400+ automated tests.'
                : 'Yritystason laatu ja yli 4 400 automaattista testiä.'}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {[
                { key: 'testCoverage', icon: '✓' },
                { key: 'techStack', icon: '⚡' },
                { key: 'architecture', icon: '🏗️' },
                { key: 'codeQuality', icon: '💎' },
                { key: 'cicd', icon: '🔄' },
                { key: 'linesOfCode', icon: '📊' },
              ].map((card) => (
                <div
                  key={card.key}
                  className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-4 md:p-6 text-center border border-slate-700/50"
                >
                  <div className="text-2xl md:text-3xl mb-2">{card.icon}</div>
                  <h3 className="text-white text-sm md:text-lg font-bold mb-1">
                    {t(`marketing.techCards.${card.key}`)}
                  </h3>
                  <p className="text-gray-400 text-xs md:text-sm">
                    {t(`marketing.techCards.${card.key}Desc`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="section section-divider bg-slate-900 relative overflow-hidden">
        <div className="hidden md:block">
          <GlowBg color="primary" position="center" size="sm" blur={160} />
        </div>
        <div className="container-custom relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {t('info.cta.title')}
            </h3>
            <Image
              src="/badges/lockup_Google_Play_RGB_color_horizontal_688x140px.png"
              alt={t('info.cta.googlePlayAlt')}
              width={688}
              height={140}
              className="mx-auto mb-6 w-40 md:w-48 h-auto opacity-80"
            />
            <p className="text-slate-300 mb-6">
              {t('info.cta.subtitle')}
            </p>
            <p className="text-slate-400 text-lg">hello@match-ops.com</p>
          </div>
        </div>
      </section>

      {/* Lightbox Modal */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-screen-lg w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-slate-900 border border-slate-700 text-white shadow hover:bg-slate-800"
              onClick={() => setLightbox(null)}
            >
              ×
            </button>
            <button
              type="button"
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

      {/* Back to top button */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-primary text-slate-900 shadow-lg hover:bg-amber-400 transition-all"
          aria-label="Back to top"
        >
          <FaArrowUp />
        </button>
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
