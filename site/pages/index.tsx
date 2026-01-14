import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import { PhoneMockup, GlowBg } from '@/components/marketing';
import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import { FaFutbol, FaClock, FaPencilAlt, FaChartLine, FaTrophy, FaUsers, FaBolt, FaShieldAlt, FaDatabase, FaGlobe } from 'react-icons/fa';

// Language-aware screenshot paths (matches marketing-assets.tsx)
const getScreenshots = (locale: string | undefined) => {
  const isEnglish = locale === 'en';
  return {
    // Main hero screenshots
    soccerfield: '/screenshots/MatchOps_main_soccerfield_full.jpg',
    timer: isEnglish
      ? '/screenshots/MatchOps_main_timer_en.jpg'
      : '/screenshots/MatchOps_Main_timer_full.jpg',
    playerstats: isEnglish
      ? '/screenshots/MatchOps_main_playerstatistics_en.jpg'
      : '/screenshots/MatchOps_Main_playerstats_full.jpg',
    // Feature card screenshots
    tacticalBoard: '/screenshots/MatcOps_main_tacticaldrawingstate_fi&en.jpg',
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
  };
};

export default function HomePage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const screenshots = getScreenshots(router.locale);
  const mobileCarouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightbox, setLightbox] = useState<null | { src: string; alt: string }>(null);
  const isEnglish = router.locale === 'en';

  // Mobile carousel labels (5 items now)
  const carouselLabels = isEnglish
    ? ['Lineup', 'Timer', 'Stats', 'Tactics', 'Events']
    : ['Kokoonpano', 'Ajastin', 'Tilastot', 'Taktiikka', 'Tapahtumat'];

  useEffect(() => {
    const container = mobileCarouselRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    let raf: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .slice()
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const index = items.indexOf(mostVisible.target as HTMLElement);
        if (index >= 0) {
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
              <span className="text-primary">MatchOps Local</span>
            </h1>
            <p className="text-xl md:text-2xl lg:text-3xl text-white mb-8">
              {t('marketing.taglines.power')}
            </p>

            {/* ===== 5-PHONE SHOWCASE ===== */}
            {/* Mobile: swipeable carousel */}
            <div className="md:hidden mt-8 -mx-4 relative">
              <div
                ref={mobileCarouselRef}
                className="flex overflow-x-auto snap-x snap-mandatory snap-always px-0 no-scrollbar"
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

            {/* Punchline below phones */}
            <p className="text-2xl md:text-3xl lg:text-4xl text-primary font-bold mt-8 md:mt-6 font-rajdhani">
              {t('marketing.taglines.memorable')}
            </p>
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

      {/* ===== FEATURE CARDS (12 features - matches marketing-assets.tsx styling) ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-10 text-center">
              {isEnglish ? 'More Features' : 'Lisää ominaisuuksia'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. Tactical Board */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.tacticalBoard')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.tacticalBoardDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.tacticalBoard} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 2. Formations */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.formations')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.formationsDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.formations} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 3. Player Roster */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.roster')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.rosterDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.roster} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 4. Player Assessment */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.assessment')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.assessmentDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.assessment} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 5. Performance Trends */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.trends')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.trendsDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.trends} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 6. Season Management */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.seasons')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.seasonsDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.seasons} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 7. Tournament Hub */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.tournaments')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.tournamentsDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.tournaments} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 8. Team Builder */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.teams')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.teamsDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.teams} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 9. Game Archive */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.archive')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.archiveDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.archive} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 10. Goal Timeline */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.goalTimeline')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.goalTimelineDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.goalTimeline} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 11. Excel Reports */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.excelExport')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.excelExportDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.excelExport} size="lg" zIndex={10} />
                </div>
              </div>

              {/* 12. Coaching Staff */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 md:p-8 flex flex-col md:flex-row">
                <div className="md:w-1/2 flex flex-col justify-center mb-6 md:mb-0">
                  <div className="text-primary text-sm font-semibold mb-2">{t('marketing.ui.feature')}</div>
                  <h3 className="text-white text-2xl md:text-3xl font-bold mb-3">{t('marketing.featureCards.personnel')}</h3>
                  <p className="text-gray-400">{t('marketing.featureCards.personnelDesc')}</p>
                </div>
                <div className="md:w-1/2 flex items-center justify-center">
                  <PhoneMockup screenshot={screenshots.personnel} size="lg" zIndex={10} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BUILT DIFFERENT ===== */}
      <section className="section section-divider bg-slate-800/50 relative overflow-hidden">
        <div className="hidden md:block">
          <GlowBg color="primary" position="center" size="lg" blur={150} />
        </div>
        <div className="container-custom relative z-10">
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

      {/* ===== FAQ ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.faq.title')}
            </h2>
            <div className="space-y-4 prose prose-invert max-w-none">
              {(['q1', 'q2', 'q3', 'q4'] as const).map((key) => (
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

      {/* ===== CTA ===== */}
      <section className="section section-divider bg-slate-800/50 relative overflow-hidden">
        <div className="hidden md:block">
          <GlowBg color="primary" position="center" size="md" blur={120} />
        </div>
        <div className="container-custom relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {isEnglish ? 'Ready to simplify game day?' : 'Valmis yksinkertaistamaan pelipäivää?'}
            </h3>
            <p className="text-slate-300 mb-6">
              {t('info.cta.title')}
            </p>
            <a
              href="mailto:hello@match-ops.com"
              className="inline-block px-8 py-3 bg-primary text-slate-900 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
            >
              {isEnglish ? 'Contact for Early Access' : 'Ota yhteyttä'}
            </a>
            <p className="text-slate-500 text-sm mt-4">hello@match-ops.com</p>
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
