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

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.matchops.local';

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
      ? '/screenshots/MatchOps_v2_roster_en.jpg'
      : '/screenshots/MatchOps_v2_roster_fi.jpg',
    assessment: isEnglish
      ? '/screenshots/MatchOps_main_playerdevelopment_en.jpg'
      : '/screenshots/MatchOps_main_playerdevelopment_fi.jpg',
    trends: isEnglish
      ? '/screenshots/MatchOps_main_developmenttrends_en.jpg'
      : '/screenshots/MatchOps_main_developmenttrends_fi.jpg',
    recap: isEnglish
      ? '/screenshots/MatchOps_main_recap_en.jpg'
      : '/screenshots/MatchOps_main_recap_fi.jpg',
    positions: isEnglish
      ? '/screenshots/MatchOps_main_positions_en.jpg'
      : '/screenshots/MatchOps_main_positions_fi.jpg',
    positionBalance: isEnglish
      ? '/screenshots/MatchOps_main_positionbalance_en.jpg'
      : '/screenshots/MatchOps_main_positionbalance_fi.jpg',
    matchReport: isEnglish
      ? '/screenshots/MatchOps_main_matchreport_en.jpg'
      : '/screenshots/MatchOps_main_matchreport_fi.jpg',
    overtime: isEnglish
      ? '/screenshots/MatchOps_main_overtime_en.jpg'
      : '/screenshots/MatchOps_main_overtime_fi.jpg',
    seasons: isEnglish
      ? '/screenshots/MatchOps_v2_seasons_en.jpg'
      : '/screenshots/MatchOps_v2_seasons_fi.jpg',
    tournaments: isEnglish
      ? '/screenshots/MatchOps_v2_tournaments_en.jpg'
      : '/screenshots/MatchOps_v2_tournaments_fi.jpg',
    teams: isEnglish
      ? '/screenshots/MatchOps_v2_teams_en.jpg'
      : '/screenshots/MatchOps_v2_teams_fi.jpg',
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
      ? '/screenshots/MatchOps_v2_personnel_en.jpg'
      : '/screenshots/MatchOps_v2_personnel_fi.jpg',
    futsal: '/screenshots/MatchOps_main_futsal_new_en_fi.jpg',
    officialRules: isEnglish
      ? '/screenshots/MatchOps_main_rules_en.jpg'
      : '/screenshots/MatchOps_main_rules_fi.jpg',
    cloudSync: isEnglish
      ? '/screenshots/MatchOps_main_cloudSync_en.jpg'
      : '/screenshots/MatchOps_main_CloudSync_fi.jpg',
    teamstats: isEnglish
      ? '/screenshots/MatchOps_main_teamstats_en.jpg'
      : '/screenshots/MatchOps_main_teamstats_fi.jpg',
    // NEW features (planner / dashboard / friendlies) — Phase 2 replaces these
    // placeholders with real shots. Kept as existing images so Phase 1 renders.
    planner: isEnglish
      ? '/screenshots/MatchOps_v2_planner_en.jpg'
      : '/screenshots/MatchOps_v2_planner_fi.jpg',
    dashboard: isEnglish
      ? '/screenshots/MatchOps_v2_dashboard_en.jpg'
      : '/screenshots/MatchOps_v2_dashboard_fi.jpg',
    friendlies: isEnglish
      ? '/screenshots/MatchOps_v2_newgame_en.jpg'
      : '/screenshots/MatchOps_v2_newgame_fi.jpg',
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
    ? ['Lineup', 'Timer', 'Stats', 'Tactics', 'Plan']
    : ['Kenttä', 'Ajastin', 'Tilastot', 'Taktiikka', 'Suunnittele'];

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
            <p className="text-xl md:text-2xl lg:text-3xl text-white mb-8">
              {t('marketing.taglines.power')}
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
                  { src: screenshots.planner, alt: 'Planner view' },
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
                {/* Phone 5: Planner - far right */}
                <PhoneMockup
                  screenshot={screenshots.planner}
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

      {/* ===== COMPACT CTA (near hero) ===== */}
      <section className="py-8 md:py-10 bg-slate-900 border-t border-slate-800">
        <div className="container-custom">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-slate-300 text-sm md:text-base">
              {t('info.cta.subtitle')}
            </p>
            <div className="flex flex-col items-center gap-3">
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:scale-105 transition-transform drop-shadow-lg"
              >
                <Image
                  src="/badges/GetItOnGooglePlay_Badge_Web_color_English.png"
                  alt={t('info.cta.googlePlayAlt')}
                  width={478}
                  height={142}
                  className="w-44 md:w-52 h-auto"
                />
              </a>
              <a href="mailto:hello@match-ops.com" className="text-slate-400 text-sm hover:text-primary transition-colors">hello@match-ops.com</a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PLAN • TRACK • DEVELOP ===== */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">
              {isEnglish ? 'Plan • Track • Discover' : 'Suunnittele • Kirjaa • Oivalla'}
            </h2>
            <p className="text-slate-400 text-center mb-10 max-w-2xl mx-auto">
              {t('info.whatIsThis.description')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* PLAN */}
              <div className="text-center">
                <div className="flex justify-center mb-4 max-w-[160px] md:max-w-none mx-auto">
                  <PhoneMockup screenshot={screenshots.soccerfield} size="2xl" />
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
                <div className="flex justify-center mb-4 max-w-[160px] md:max-w-none mx-auto">
                  <PhoneMockup screenshot={screenshots.timer} size="2xl" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  {isEnglish ? 'Track' : 'Kirjaa'}
                </h3>
                <p className="text-slate-300">
                  {t('marketing.features.track.desc')}
                </p>
              </div>
              {/* DISCOVER / OIVALLA */}
              <div className="text-center">
                <div className="flex justify-center mb-4 max-w-[160px] md:max-w-none mx-auto">
                  <PhoneMockup screenshot={screenshots.teamstats} size="2xl" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  {isEnglish ? 'Discover' : 'Oivalla'}
                </h3>
                <p className="text-slate-300">
                  {t('marketing.features.assess.desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FLAGSHIP SPOTLIGHTS ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto space-y-16 md:space-y-24">
            {[
              { key: 'planner', screenshot: screenshots.planner },
              { key: 'gameday', screenshot: screenshots.soccerfield },
              { key: 'stats', screenshot: screenshots.playerstats },
            ].map((s, i) => (
              <div
                key={s.key}
                className={`flex flex-col items-center gap-8 md:gap-16 ${
                  i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'
                }`}
              >
                <div className="md:w-1/2 text-center md:text-left">
                  <div className="text-primary text-sm font-semibold uppercase tracking-wider mb-2">
                    {t(`marketing.spotlights.${s.key}.eyebrow`)}
                  </div>
                  <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
                    {t(`marketing.spotlights.${s.key}.title`)}
                  </h2>
                  <p className="text-slate-300 text-base md:text-lg leading-relaxed">
                    {t(`marketing.spotlights.${s.key}.desc`)}
                  </p>
                </div>
                <div className="md:w-1/2 flex justify-center">
                  <PhoneMockup screenshot={s.screenshot} size="3xl" zIndex={10} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURE BANDS (grouped, replaces the old flat card list) ===== */}
      <section className="section section-divider bg-slate-800/40">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto space-y-16">
            {[
              { band: 'gameDay', cards: [
                { key: 'tacticalBoard', screenshot: screenshots.tacticalBoard },
                { key: 'goalTimeline', screenshot: screenshots.goalTimeline },
                { key: 'overtime', screenshot: screenshots.overtime },
                { key: 'formations', screenshot: screenshots.formations },
                { key: 'recap', screenshot: screenshots.recap },
              ] },
              { band: 'development', cards: [
                { key: 'assessment', screenshot: screenshots.assessment },
                { key: 'trends', screenshot: screenshots.trends },
                { key: 'positions', screenshot: screenshots.positions },
                { key: 'positionBalance', screenshot: screenshots.positionBalance },
                { key: 'matchReport', screenshot: screenshots.matchReport },
              ] },
              { band: 'club', cards: [
                { key: 'roster', screenshot: screenshots.roster },
                { key: 'teams', screenshot: screenshots.teams },
                { key: 'personnel', screenshot: screenshots.personnel },
                { key: 'seasons', screenshot: screenshots.seasons },
                { key: 'tournaments', screenshot: screenshots.tournaments },
                { key: 'friendlies', screenshot: screenshots.friendlies },
                { key: 'futsal', screenshot: screenshots.futsal },
              ] },
              { band: 'statsSharing', cards: [
                { key: 'dashboard', screenshot: screenshots.dashboard },
                { key: 'excelExport', screenshot: screenshots.excelExport },
                { key: 'archive', screenshot: screenshots.archive },
                { key: 'cloudSync', screenshot: screenshots.cloudSync },
                { key: 'officialRules', screenshot: screenshots.officialRules },
              ] },
            ].map((group) => (
              <div key={group.band}>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 text-center">
                  {t(`marketing.bands.${group.band}`)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                  {group.cards.map((card) => (
                    <div
                      key={card.key}
                      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-5 md:p-6 border border-slate-700/40 flex flex-col items-center text-center"
                    >
                      <div className="flex justify-center mb-4">
                        <PhoneMockup screenshot={card.screenshot} size="xl" zIndex={10} />
                      </div>
                      <h3 className="text-white text-lg font-bold mb-2">
                        {t(`marketing.featureCards.${card.key}`)}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        {t(`marketing.featureCards.${card.key}Desc`)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TECH STATS (hidden — not relevant to coaches) ===== */}
      <section className="section section-divider bg-slate-800/50 hidden">
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
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mb-6 hover:scale-105 transition-transform drop-shadow-xl"
            >
              <Image
                src="/badges/GetItOnGooglePlay_Badge_Web_color_English.png"
                alt={t('info.cta.googlePlayAlt')}
                width={478}
                height={142}
                className="mx-auto w-52 md:w-64 h-auto"
              />
            </a>
            <p className="text-slate-300 mb-6">
              {t('info.cta.subtitle')}
            </p>
            <a href="mailto:hello@match-ops.com" className="text-slate-400 text-lg hover:text-primary transition-colors">hello@match-ops.com</a>
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
          aria-label={t('nav.backToTop')}
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
