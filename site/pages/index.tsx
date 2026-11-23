import Layout from '@/components/Layout';
import { PhoneMockup, GlowBg, VideoFacade } from '@/components/marketing';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import { FaArrowUp, FaCheck, FaChevronDown, FaYoutube } from 'react-icons/fa';
import {
  SITE_URL,
  YOUTUBE_CHANNEL_URL,
  absoluteUrl,
  ogImage,
  playBadge,
  playStoreUrl,
  youtubeId,
} from '@/lib/site';

// Language-aware screenshot paths (matches marketing-assets.tsx).
// All captured 2026-11 from the redesigned app with the fictional demo club
// (MatchOps_v3_<name>_<fi|en>.jpg, 1080x2340).
const getScreenshots = (locale: string | undefined) => {
  const lang = locale === 'en' ? 'en' : 'fi';
  const shot = (name: string) => `/screenshots/MatchOps_v3_${name}_${lang}.jpg`;
  return {
    timer: shot('timer'), // big match clock, Maali meille / Vastustaja +1, next sub
    planner: shot('planner'), // Ottelusuunnittelu: minutes per player, colour-coded
    poytakirja: shot('poytakirja'), // Pöytäkirja text with the Kopioi button
    plan: shot('plan'), // one-game plan on the field
    matchview: shot('matchview'), // match view with players in position
    finish: shot('finish'), // Viimeistele ottelu
    attendance: shot('attendance'), // Ketkä ovat paikalla?
    nextMatch: shot('nextmatch'),
    tacticalBoard: shot('tacticalboard'),
    matchReport: shot('matchreport'),
    positionBalance: shot('positionbalance'),
    officialRules: shot('rules'),
    futsal: shot('futsal'),
    playerStats: shot('playerstats'),
  };
};

type FaqItem = { q: string; a: string };

function PlayBadge({
  placement,
  locale,
  alt,
  className,
  priority = false,
}: {
  placement: string;
  locale: string;
  alt: string;
  className: string;
  priority?: boolean;
}) {
  return (
    <a
      href={playStoreUrl(placement, locale)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block hover:scale-105 transition-transform drop-shadow-lg"
    >
      <Image src={playBadge(locale)} alt={alt} width={646} height={250} className={className} priority={priority} />
    </a>
  );
}

export default function HomePage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const locale = router.locale === 'en' ? 'en' : 'fi';
  const s = getScreenshots(locale);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 800);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const faqItems = t('home.faq.items', { returnObjects: true }) as FaqItem[];
  const playAlt = t('info.cta.googlePlayAlt');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'MatchOps',
      description: t('seo.home.description'),
      url: absoluteUrl('/', locale),
      image: ogImage(locale),
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Android',
      inLanguage: ['fi', 'en'],
      downloadUrl: 'https://play.google.com/store/apps/details?id=com.matchops.local',
      installUrl: 'https://play.google.com/store/apps/details?id=com.matchops.local',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'Ville Pajala' },
      publisher: { '@type': 'Organization', name: 'MatchOps', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: locale,
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ];

  const trust = ['free', 'noAds', 'eu', 'taso'] as const;

  const steps = [
    { key: 'plan', screenshot: s.plan, alt: 'plan' },
    { key: 'rotate', screenshot: s.matchview, alt: 'matchview' },
    { key: 'record', screenshot: s.poytakirja, alt: 'poytakirja' },
  ] as const;

  const spotlights = [
    { key: 'taso', screenshot: s.finish, alt: 'finish' },
    { key: 'planner', screenshot: s.planner, alt: 'planner' },
    { key: 'attendance', screenshot: s.attendance, alt: 'attendance' },
  ] as const;

  const features = [
    { key: 'tacticalBoard', screenshot: s.tacticalBoard },
    { key: 'matchReport', screenshot: s.matchReport },
    { key: 'positionBalance', screenshot: s.positionBalance },
    { key: 'nextMatch', screenshot: s.nextMatch },
    { key: 'officialRules', screenshot: s.officialRules },
    { key: 'futsal', screenshot: s.futsal },
    { key: 'stats', screenshot: s.playerStats, alt: 'playerStats' },
  ];

  const allFeatureGroups = [
    { group: 'gameDay', items: ['quickGoal', 'goalTimeline', 'overtime', 'formations'] },
    { group: 'afterGame', items: ['positions', 'excelExport', 'archive'] },
    {
      group: 'teamSeason',
      items: ['roster', 'teams', 'personnel', 'seasons', 'tournaments', 'friendlies', 'cloudSync'],
    },
  ];

  return (
    <Layout title={t('seo.home.title')} description={t('seo.home.description')} jsonLd={jsonLd}>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-slate-900 pt-8 pb-14 md:pt-16 md:pb-20">
        <div className="hidden md:block">
          <GlowBg color="primary" position="top-right" size="md" blur={150} />
          <GlowBg color="amber" position="bottom-left" size="sm" blur={130} />
        </div>
        <div className="container-custom relative z-10">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12 max-w-6xl mx-auto">
            <div className="text-center lg:text-left">
              <p className="text-xs md:text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                {t('home.hero.eyebrow')}
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.05] mb-4">
                {t('home.hero.title')}
              </h1>
              <p className="text-lg md:text-xl text-slate-300 mb-6 max-w-xl mx-auto lg:mx-0">
                {t('home.hero.subtitle')}
              </p>
              <div className="flex flex-col items-center lg:items-start gap-2 mb-6">
                <PlayBadge
                  placement="hero"
                  locale={locale}
                  alt={playAlt}
                  className="w-48 md:w-56 h-auto"
                  priority
                />
                <p className="text-sm text-slate-400">{t('home.hero.platform')}</p>
              </div>
              <ul className="flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-2 text-sm text-slate-200">
                {trust.map((key) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <FaCheck className="h-3 w-3 text-primary" aria-hidden="true" />
                    {t(`home.hero.trust.${key}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* Phones: one on small screens, a fan of three on large ones */}
            <div className="relative flex justify-center">
              <div className="lg:hidden w-[240px] max-w-[70vw]">
                <PhoneMockup screenshot={s.timer} alt={t('home.alt.timer')} size="2xl" priority />
              </div>
              <div className="hidden lg:block relative h-[600px] w-full">
                <PhoneMockup
                  screenshot={s.planner}
                  alt={t('home.alt.planner')}
                  size="xl"
                  style={{ position: 'absolute', left: '2%', top: '50%', transform: 'translateY(-50%) rotate(-6deg)' }}
                  zIndex={1}
                />
                <PhoneMockup
                  screenshot={s.poytakirja}
                  alt={t('home.alt.poytakirja')}
                  size="xl"
                  style={{ position: 'absolute', right: '2%', top: '50%', transform: 'translateY(-50%) rotate(6deg)' }}
                  zIndex={1}
                />
                <PhoneMockup
                  screenshot={s.timer}
                  alt={t('home.alt.timer')}
                  size="2xl"
                  style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  zIndex={10}
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PLAN • ROTATE • RECORD ===== */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-10 text-center">{t('home.steps.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
              {steps.map((step, i) => (
                <div key={step.key} className="text-center">
                  <div className="flex justify-center mb-5 max-w-[170px] md:max-w-none mx-auto">
                    <PhoneMockup screenshot={step.screenshot} alt={t(`home.alt.${step.alt}`)} size="2xl" />
                  </div>
                  <h3 className="text-2xl font-bold text-primary mb-2">
                    <span className="text-slate-500 mr-2">{i + 1}.</span>
                    {t(`home.steps.${step.key}.title`)}
                  </h3>
                  <p className="text-slate-300 max-w-sm mx-auto">{t(`home.steps.${step.key}.desc`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== VIDEO ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="md:w-1/2 text-center md:text-left">
              <div className="text-primary text-sm font-semibold uppercase tracking-wider mb-2">
                {t('home.video.eyebrow')}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t('home.video.title')}</h2>
              <p className="text-slate-300 text-lg mb-6">{t('home.video.desc')}</p>
              <ul className="space-y-3 text-slate-300">
                <li>
                  <a
                    href={`https://www.youtube.com/shorts/${youtubeId('matchDay', locale)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-light underline underline-offset-4"
                  >
                    {t('home.video.matchDay')}
                  </a>
                </li>
                <li>
                  <a
                    href={YOUTUBE_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-slate-200 hover:text-primary"
                  >
                    <FaYoutube className="h-5 w-5 text-red-500" aria-hidden="true" />
                    {t('home.video.channel')}
                  </a>
                </li>
              </ul>
              <p className="text-xs text-slate-500 mt-6">{t('home.video.privacy')}</p>
            </div>
            <div className="md:w-1/2 flex justify-center w-full">
              <VideoFacade
                videoId={youtubeId('hero', locale)}
                title={t('home.video.heroTitle')}
                poster={s.nextMatch}
                playLabel={t('home.video.play')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== SPOTLIGHTS: Taso, tournament day, absences ===== */}
      <section className="section section-divider bg-slate-800/40">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto space-y-16 md:space-y-24">
            {spotlights.map((spot, i) => (
              <div
                key={spot.key}
                id={spot.key === 'taso' ? 'taso' : undefined}
                className={`flex flex-col items-center gap-8 md:gap-16 ${
                  i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'
                }`}
              >
                <div className="md:w-1/2 text-center md:text-left">
                  <div className="text-primary text-sm font-semibold uppercase tracking-wider mb-2">
                    {t(`home.spotlights.${spot.key}.eyebrow`)}
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                    {t(`home.spotlights.${spot.key}.title`)}
                  </h2>
                  <p className="text-slate-300 text-base md:text-lg leading-relaxed">
                    {t(`home.spotlights.${spot.key}.desc`)}
                  </p>
                </div>
                <div className="md:w-1/2 flex justify-center max-w-[230px] md:max-w-none">
                  <PhoneMockup screenshot={spot.screenshot} alt={t(`home.alt.${spot.alt}`)} size="3xl" zIndex={10} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== KEY FEATURES + ALL FEATURES ===== */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-10 text-center">{t('home.features.title')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {features.map((f) => (
                <div
                  key={f.key}
                  className="bg-gradient-to-br from-slate-800/80 to-slate-900 rounded-lg p-4 md:p-5 border border-slate-700/40 flex flex-row lg:flex-col items-center gap-4 text-left lg:text-center"
                >
                  <div className="flex-shrink-0 w-[96px] lg:w-[160px]">
                    <PhoneMockup
                      screenshot={f.screenshot}
                      alt={t(`home.alt.${f.alt ?? f.key}`)}
                      size="lg"
                    />
                  </div>
                  <div>
                    <h3 className="text-white text-lg font-bold mb-1">{t(`home.features.${f.key}.title`)}</h3>
                    <p className="text-slate-400 text-sm">{t(`home.features.${f.key}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>

            <details className="group mt-10 rounded-lg border border-slate-700/50 bg-slate-800/40">
              <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-4 text-primary font-semibold [&::-webkit-details-marker]:hidden">
                {t('home.allFeatures.summary')}
                <FaChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid gap-8 px-5 pb-6 md:grid-cols-3">
                {allFeatureGroups.map((g) => (
                  <div key={g.group}>
                    <h3 className="text-lg font-bold text-white mb-3">{t(`home.allFeatures.groups.${g.group}`)}</h3>
                    <ul className="space-y-3">
                      {g.items.map((item) => (
                        <li key={item}>
                          <div className="text-slate-100 font-semibold">
                            {t(`home.allFeatures.items.${item}.title`)}
                          </div>
                          <p className="text-slate-400 text-sm">{t(`home.allFeatures.items.${item}.desc`)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="px-5 pb-6 text-center">
                <Link href="/guide" className="text-primary hover:text-primary-light underline underline-offset-4">
                  {t('home.allFeatures.guideLink')}
                </Link>
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ===== KIDS' DATA ===== */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div>
              <div className="text-primary text-sm font-semibold uppercase tracking-wider mb-2">
                {t('home.kids.eyebrow')}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{t('home.kids.title')}</h2>
              <dl className="grid gap-5 sm:grid-cols-2">
                {(['what', 'where', 'who', 'delete'] as const).map((key) => (
                  <div key={key}>
                    <dt className="text-white font-semibold mb-1">{t(`home.kids.items.${key}.title`)}</dt>
                    <dd className="text-slate-300 text-sm">{t(`home.kids.items.${key}.desc`)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-slate-200">
                {t('home.kids.notice')}
              </p>
              <p className="mt-4 text-sm">
                <Link href="/privacy" className="text-primary hover:text-primary-light underline underline-offset-4">
                  {t('home.kids.privacyLink')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="section section-divider bg-slate-900 scroll-mt-4">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">{t('home.faq.title')}</h2>
            <div className="divide-y divide-slate-700/60 rounded-lg border border-slate-700/60 bg-slate-800/40">
              {faqItems.map((item) => (
                <details key={item.q} className="group px-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-white font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <FaChevronDown
                      className="h-3 w-3 flex-shrink-0 text-primary transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-4 text-slate-300">{item.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-6 text-center">
              <Link href="/guide/faq" className="text-primary hover:text-primary-light underline underline-offset-4">
                {t('home.faq.more')}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="section section-divider bg-slate-800/50 relative overflow-hidden">
        <div className="hidden md:block">
          <GlowBg color="primary" position="center" size="sm" blur={160} />
        </div>
        <div className="container-custom relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{t('home.cta.title')}</h2>
            <p className="text-slate-300 mb-6">{t('home.cta.subtitle')}</p>
            <PlayBadge placement="final_cta" locale={locale} alt={playAlt} className="mx-auto w-56 md:w-64 h-auto" />
          </div>
        </div>
      </section>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-4 right-4 z-50 p-3 rounded-full bg-primary/90 text-slate-900 shadow-lg hover:bg-amber-400 transition-all"
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
      ...(await serverSideTranslations(locale || 'fi', ['common'])),
    },
  };
};
