import Head from 'next/head';
import Image from 'next/image';

// Asset dimensions for different platforms
const FORMATS = {
  linkedinPersonal: { width: 1584, height: 396, name: 'LinkedIn Personal Banner' },
  linkedinCompany: { width: 1128, height: 191, name: 'LinkedIn Company Banner' },
  twitter: { width: 1500, height: 500, name: 'Twitter/X Header' },
  facebook: { width: 820, height: 312, name: 'Facebook Cover' },
  instagramPost: { width: 1080, height: 1080, name: 'Instagram Post' },
  instagramStory: { width: 1080, height: 1920, name: 'Instagram Story' },
  openGraph: { width: 1200, height: 630, name: 'Open Graph / Social Share' },
  appStoreFeature: { width: 1024, height: 500, name: 'App Store Feature Graphic' },
};

// Phone mockup component with CSS styling
function PhoneMockup({
  screenshot,
  size = 'md',
  className = '',
  style = {},
  zIndex = 0,
  imageFilter = 'contrast(1.075) saturate(1.025)',
}: {
  screenshot: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  style?: React.CSSProperties;
  zIndex?: number;
  imageFilter?: string;
}) {
  const sizes = {
    xs: { width: 60, height: 130 },
    sm: { width: 80, height: 173 },
    md: { width: 120, height: 260 },
    lg: { width: 160, height: 347 },
    xl: { width: 200, height: 433 },
    '2xl': { width: 240, height: 520 },
  };

  const { width, height } = sizes[size];
  const borderRadius = size === 'xs' ? '1rem' : size === 'sm' ? '1.25rem' : '1.5rem';
  const innerRadius = size === 'xs' ? '0.75rem' : size === 'sm' ? '1rem' : '1.25rem';

  return (
    <div
      className={`relative ${className}`}
      style={{
        width: width + 8,
        height: height + 8,
        background: 'linear-gradient(145deg, #3a3a3a, #1a1a1a)',
        borderRadius,
        padding: '4px',
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.1),
          0 25px 50px -12px rgba(0,0,0,0.7),
          0 0 60px -15px rgba(245, 158, 11, 0.2),
          inset 0 1px 1px rgba(255,255,255,0.1)
        `,
        zIndex,
        ...style,
      }}
    >
      {/* Camera hole */}
      {size !== 'xs' && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-gray-800"
          style={{
            width: size === 'sm' ? 4 : 6,
            height: size === 'sm' ? 4 : 6,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
        />
      )}
      {/* Screen */}
      <div
        className="relative w-full h-full overflow-hidden bg-black"
        style={{ borderRadius: innerRadius, filter: imageFilter || undefined }}
      >
        <Image src={screenshot} alt="App screenshot" fill className="object-cover" />
      </div>
    </div>
  );
}

// Three phones arrangement - middle always in front
function ThreePhones({
  leftSize = 'md',
  middleSize = 'lg',
  rightSize = 'md',
  overlap = 20,
  stagger = 30,
  className = '',
}: {
  leftSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  middleSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  rightSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  overlap?: number;
  stagger?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-end ${className}`}>
      <PhoneMockup
        screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
        size={leftSize}
        style={{ marginRight: -overlap, transform: `translateY(${stagger}px)` }}
        zIndex={1}
      />
      <PhoneMockup
        screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
        size={middleSize}
        zIndex={10}
      />
      <PhoneMockup
        screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
        size={rightSize}
        style={{ marginLeft: -overlap, transform: `translateY(${stagger}px)` }}
        zIndex={1}
      />
    </div>
  );
}

// Three phones arrangement - balanced sizes, aligned (no stagger)
function ThreePhonesBalanced({
  sideSize = 'md',
  middleSize = 'lg',
  overlap = 25,
  className = '',
}: {
  sideSize?: 'sm' | 'md' | 'lg' | 'xl';
  middleSize?: 'md' | 'lg' | 'xl' | '2xl';
  overlap?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center ${className}`}>
      <PhoneMockup
        screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
        size={sideSize}
        style={{ marginRight: -overlap }}
        zIndex={1}
      />
      <PhoneMockup
        screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
        size={middleSize}
        zIndex={10}
      />
      <PhoneMockup
        screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
        size={sideSize}
        style={{ marginLeft: -overlap }}
        zIndex={1}
      />
    </div>
  );
}

// Reusable asset container with exact dimensions
function AssetContainer({
  id,
  width,
  height,
  name,
  children,
  className = '',
  scale = 1,
}: {
  id: string;
  width: number;
  height: number;
  name: string;
  children: React.ReactNode;
  className?: string;
  scale?: number;
}) {
  const displayWidth = width * scale;
  const displayHeight = height * scale;

  return (
    <div className="mb-12">
      <div className="mb-3 flex items-center gap-4">
        <span className="text-sm font-mono bg-slate-700 text-primary px-2 py-1 rounded">{id}</span>
        <div>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          <p className="text-gray-500 text-xs">
            {width} × {height}px {scale !== 1 && `(${Math.round(scale * 100)}% scale)`}
          </p>
        </div>
      </div>
      <div
        id={id}
        className={`relative font-sans ${className}`}
        style={{
          width: displayWidth,
          height: displayHeight,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Logo component
function Logo({ size = 60, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logos/app-logo-yellow.png"
      alt="MatchOps Local"
      width={size}
      height={size}
      className={className}
    />
  );
}

// Title text component
function TitleText({
  className = '',
  size = 'lg',
  dark = false,
}: {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  dark?: boolean;
}) {
  const sizes = {
    xs: 'text-lg',
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
    '2xl': 'text-5xl',
    '3xl': 'text-6xl',
  };

  return (
    <span
      className={`font-rajdhani font-bold ${dark ? 'text-slate-900' : 'text-primary'} ${sizes[size]} ${className}`}
    >
      MatchOps Local
    </span>
  );
}

// Feature bullets
function FeatureBullets({
  features,
  className = '',
  size = 'md',
}: {
  features: string[];
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const textSize = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };
  const dotSize = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-2.5 h-2.5' };

  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      {features.map((f, i) => (
        <span key={i} className={`flex items-center gap-2 text-gray-300 ${textSize[size]}`}>
          <span className={`${dotSize[size]} bg-primary rounded-full`} />
          {f}
        </span>
      ))}
    </div>
  );
}

// URL component
function SiteUrl({
  size = 'md',
  className = '',
  variant = 'light',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'light' | 'dark' | 'primary';
}) {
  const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };
  const colors = {
    light: 'text-gray-400',
    dark: 'text-gray-600',
    primary: 'text-primary/70',
  };

  return <span className={`${sizes[size]} ${colors[variant]} ${className}`}>match-ops.com</span>;
}

// Glow effect background
function GlowBg({
  color = 'primary',
  position = 'center',
  size = 'lg',
  blur = 100,
}: {
  color?: 'primary' | 'amber' | 'blue' | 'green';
  position?: 'center' | 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  blur?: number;
}) {
  const colors = {
    primary: 'bg-primary/20',
    amber: 'bg-amber-500/15',
    blue: 'bg-blue-500/15',
    green: 'bg-green-500/15',
  };
  const sizes = { sm: 300, md: 500, lg: 700, xl: 900 };
  const positions = {
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'top-right': 'top-0 right-0 translate-x-1/4 -translate-y-1/4',
    'bottom-left': 'bottom-0 left-0 -translate-x-1/4 translate-y-1/4',
    'top-left': 'top-0 left-0 -translate-x-1/4 -translate-y-1/4',
    'bottom-right': 'bottom-0 right-0 translate-x-1/4 translate-y-1/4',
  };

  return (
    <div
      className={`absolute ${positions[position]} ${colors[color]} rounded-full`}
      style={{ width: sizes[size], height: sizes[size], filter: `blur(${blur}px)` }}
    />
  );
}

export default function MarketingAssets() {
  return (
    <>
      <Head>
        <title>Marketing Assets - MatchOps Local</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gray-950 py-12 px-8">
        <div className="max-w-[2800px] mx-auto">
          {/* Header */}
          <div className="mb-12 border-b border-gray-800 pb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Marketing Assets</h1>
            <p className="text-gray-400 mb-4">
              Screenshot these at native resolution. Each shows dimensions for reference.
            </p>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>LinkedIn: 1584×396</span>
              <span>Twitter: 1500×500</span>
              <span>Instagram: 1080×1080</span>
              <span>OG: 1200×630</span>
            </div>
          </div>

          {/* ============================================ */}
          {/* LINKEDIN PERSONAL BANNERS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              LinkedIn Personal Banners (1584×396)
            </h2>

            <div className="space-y-8">
              {/* V1: Three phones showcase */}
              <AssetContainer id="li-1" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-6">
                    <Logo size={90} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhones leftSize="sm" middleSize="lg" rightSize="sm" overlap={24} stagger={20} />
                </div>
              </AssetContainer>

              {/* V1-B: Bigger side phones, aligned, MEDIUM contrast */}
              <AssetContainer id="li-1b" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center gap-24 relative">
                  <div className="flex items-center gap-6" style={{ marginLeft: 330 }}>
                    <Logo size={130} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <div className="flex items-center" style={{ marginRight: -10 }}>
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
                      size="md"
                      style={{ marginRight: -20 }}
                      zIndex={1}
                                          />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
                      size="lg"
                      zIndex={10}
                                          />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
                      size="md"
                      style={{ marginLeft: -20 }}
                      zIndex={1}
                                          />
                  </div>
                </div>
              </AssetContainer>

              {/* V1-B-CONTRAST: Bigger side phones, aligned, WITH contrast */}
              <AssetContainer id="li-1b-contrast" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-6">
                    <Logo size={90} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
                      size="md"
                      style={{ marginRight: -20 }}
                      zIndex={1}
                                          />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
                      size="lg"
                      zIndex={10}
                                          />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
                      size="md"
                      style={{ marginLeft: -20 }}
                      zIndex={1}
                                          />
                  </div>
                </div>
              </AssetContainer>

              {/* V1-ALT: Three phones - same size, aligned */}
              <AssetContainer id="li-1-alt" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-6">
                    <Logo size={90} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhonesBalanced sideSize="md" middleSize="md" overlap={20} />
                </div>
              </AssetContainer>

              {/* V1-ALT2: Three phones - center slightly bigger, aligned */}
              <AssetContainer id="li-1-alt2" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-6">
                    <Logo size={90} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhonesBalanced sideSize="sm" middleSize="md" overlap={18} />
                </div>
              </AssetContainer>

              {/* V2: Gradient glow with single phone */}
              <AssetContainer id="li-2" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="xl" blur={120} />
                  <GlowBg color="amber" position="bottom-right" size="md" blur={80} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-20">
                    <div className="flex items-center gap-6">
                      <Logo size={80} />
                      <div>
                        <TitleText size="2xl" />
                        <p className="text-gray-400 text-xl mt-2">Plan • Track • Assess</p>
                        <SiteUrl className="mt-2" size="sm" />
                      </div>
                    </div>
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              {/* V3: Minimal centered */}
              <AssetContainer id="li-3" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center justify-center gap-8">
                  <Logo size={100} />
                  <div className="h-20 w-px bg-primary/30" />
                  <div>
                    <TitleText size="2xl" />
                    <p className="text-gray-400 text-lg mt-1">Local-first soccer coaching app</p>
                    <SiteUrl className="mt-2" size="sm" />
                  </div>
                </div>
              </AssetContainer>

              {/* V4: Feature words */}
              <AssetContainer id="li-4" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-between px-16">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-5">
                      <Logo size={80} />
                      <TitleText size="xl" />
                    </div>
                    <SiteUrl className="mt-2" size="sm" />
                  </div>
                  <div className="flex items-center gap-16">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Plan</div>
                      <div className="text-gray-400">Lineups</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Track</div>
                      <div className="text-gray-400">Live Games</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Assess</div>
                      <div className="text-gray-400">Statistics</div>
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* V5: Dark dramatic */}
              <AssetContainer id="li-5" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-black relative overflow-hidden">
                  <GlowBg color="primary" position="center" size="xl" blur={150} />
                  <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                    <div className="flex items-center gap-12">
                      <Logo size={100} />
                      <TitleText size="2xl" />
                    </div>
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                </div>
              </AssetContainer>

              {/* V6: Two phones + text */}
              <AssetContainer id="li-6" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex items-center px-16 relative">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      <Logo size={70} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-300 text-lg mb-4">Soccer coaching made simple</p>
                    <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Signup']} size="sm" />
                    <SiteUrl className="mt-3" size="sm" />
                  </div>
                  <div className="flex items-end gap-2">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
                      size="md"
                      style={{ transform: 'translateY(20px)', marginLeft: -30 }}
                      zIndex={1}
                    />
                  </div>
                </div>
              </AssetContainer>

              {/* V7: Stats highlight */}
              <AssetContainer id="li-7" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-between px-20 relative">
                  <div>
                    <div className="flex items-center gap-4 mb-4">
                      <Logo size={70} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-400 text-lg">Track player development with data</p>
                    <SiteUrl className="mt-3" size="sm" />
                  </div>
                  <div className="flex items-end gap-2">
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
                      size="md"
                      style={{ transform: 'translateY(15px)', marginRight: -20 }}
                      zIndex={1}
                    />
                    <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="lg" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              {/* V8: Horizontal stripe */}
              <AssetContainer id="li-8" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-950 relative">
                  <div className="absolute inset-x-0 top-1/2 h-24 -translate-y-1/2 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-20">
                    <div className="flex items-center gap-6">
                      <Logo size={80} />
                      <div>
                        <TitleText size="xl" />
                        <p className="text-gray-400 mt-1">Plan • Track • Assess</p>
                        <SiteUrl className="mt-2" size="sm" />
                      </div>
                    </div>
                    <ThreePhones leftSize="sm" middleSize="md" rightSize="sm" overlap={16} stagger={15} />
                  </div>
                </div>
              </AssetContainer>

              {/* V9: Corner accent */}
              <AssetContainer id="li-9" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-900 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-bl-full" />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-20">
                    <div className="flex items-center gap-6">
                      <Logo size={80} />
                      <div>
                        <TitleText size="2xl" />
                        <SiteUrl className="mt-2" size="sm" />
                      </div>
                    </div>
                    <p className="text-gray-300 text-xl">Your game day toolkit</p>
                  </div>
                </div>
              </AssetContainer>

              {/* V10: Grid background */}
              <AssetContainer id="li-10" {...FORMATS.linkedinPersonal}>
                <div className="w-full h-full bg-slate-900 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-5"
                    style={{
                      backgroundImage: `linear-gradient(rgba(245,158,11,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.3) 1px, transparent 1px)`,
                      backgroundSize: '40px 40px',
                    }}
                  />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-20">
                    <div className="flex items-center gap-5">
                      <Logo size={80} />
                      <div>
                        <TitleText size="xl" />
                        <p className="text-gray-400 mt-1">Local-first soccer coaching</p>
                        <SiteUrl className="mt-2" size="sm" />
                      </div>
                    </div>
                    <ThreePhones leftSize="sm" middleSize="lg" rightSize="sm" overlap={20} stagger={25} />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* LINKEDIN COMPANY BANNERS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              LinkedIn Company Banners (1128×191)
            </h2>

            <div className="space-y-8">
              <AssetContainer id="li-co-1" {...FORMATS.linkedinCompany}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-12">
                  <div className="flex items-center gap-4">
                    <Logo size={50} />
                    <div>
                      <TitleText size="lg" />
                      <SiteUrl size="sm" />
                    </div>
                  </div>
                  <p className="text-gray-400">For soccer coaches who value privacy</p>
                </div>
              </AssetContainer>

              <AssetContainer id="li-co-2" {...FORMATS.linkedinCompany}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-center gap-6">
                  <Logo size={45} />
                  <div>
                    <TitleText size="lg" />
                    <SiteUrl size="sm" />
                  </div>
                  <div className="h-8 w-px bg-gray-700" />
                  <p className="text-gray-400">Plan • Track • Assess</p>
                </div>
              </AssetContainer>

              <AssetContainer id="li-co-3" {...FORMATS.linkedinCompany}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="md" blur={80} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-12">
                    <div className="flex items-center gap-4">
                      <Logo size={50} />
                      <div>
                        <TitleText size="lg" />
                        <SiteUrl size="sm" />
                      </div>
                    </div>
                    <FeatureBullets features={['Offline', 'Private', 'No Signup']} size="sm" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* TWITTER/X HEADERS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Twitter/X Headers (1500×500)
            </h2>

            <div className="space-y-8">
              {/* T1: Three phones */}
              <AssetContainer id="tw-1" {...FORMATS.twitter}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-primary/20 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-8">
                    <Logo size={100} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-2">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhones leftSize="sm" middleSize="lg" rightSize="sm" overlap={20} stagger={25} />
                </div>
              </AssetContainer>

              {/* T1-ALT: Three phones - same size, aligned */}
              <AssetContainer id="tw-1-alt" {...FORMATS.twitter}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-primary/20 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-8">
                    <Logo size={100} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-2">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhonesBalanced sideSize="lg" middleSize="lg" overlap={25} />
                </div>
              </AssetContainer>

              {/* T1-ALT2: Three phones - center slightly bigger, aligned */}
              <AssetContainer id="tw-1-alt2" {...FORMATS.twitter}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-primary/20 flex items-center justify-between px-20 relative">
                  <div className="flex items-center gap-8">
                    <Logo size={100} />
                    <div>
                      <TitleText size="2xl" />
                      <p className="text-gray-300 text-xl mt-2">Your game day toolkit</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                  <ThreePhonesBalanced sideSize="md" middleSize="lg" overlap={22} />
                </div>
              </AssetContainer>

              {/* T2: Feature highlights */}
              <AssetContainer id="tw-2" {...FORMATS.twitter}>
                <div className="w-full h-full bg-slate-900 flex items-center px-16 relative">
                  <SiteUrl className="absolute bottom-4 right-6" size="sm" />
                  <div className="flex items-center gap-6 mr-auto">
                    <Logo size={80} />
                    <TitleText size="xl" />
                  </div>
                  <div className="flex items-center gap-16 text-gray-300">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Plan</div>
                      <div className="text-sm">Lineups & Tactics</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Track</div>
                      <div className="text-sm">Live Game Events</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary">Assess</div>
                      <div className="text-sm">Stats & Analytics</div>
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* T3: Dramatic glow */}
              <AssetContainer id="tw-3" {...FORMATS.twitter}>
                <div className="w-full h-full bg-black relative overflow-hidden">
                  <GlowBg color="primary" position="center" size="xl" blur={150} />
                  <GlowBg color="amber" position="bottom-right" size="md" blur={100} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-20">
                    <div>
                      <div className="flex items-center gap-5 mb-4">
                        <Logo size={90} />
                        <TitleText size="2xl" />
                      </div>
                      <p className="text-gray-300 text-xl">Local-first soccer coaching app</p>
                      <SiteUrl className="mt-3" size="sm" />
                    </div>
                    <ThreePhones leftSize="md" middleSize="xl" rightSize="md" overlap={30} stagger={35} />
                  </div>
                </div>
              </AssetContainer>

              {/* T4: Single phone focus */}
              <AssetContainer id="tw-4" {...FORMATS.twitter}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center px-20 relative">
                  <div className="flex-1">
                    <div className="flex items-center gap-5 mb-4">
                      <Logo size={80} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-300 text-lg mb-6">
                      Plan lineups, track games live, build statistics.
                      <br />
                      Works offline. Your data stays private.
                    </p>
                    <FeatureBullets features={['No Signup', 'Works Offline', 'Data Stays Local']} />
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="xl" zIndex={10} />
                </div>
              </AssetContainer>

              {/* T5: Minimal */}
              <AssetContainer id="tw-5" {...FORMATS.twitter}>
                <div className="w-full h-full bg-slate-950 flex items-center justify-center gap-10 relative">
                  <SiteUrl className="absolute bottom-4 right-6" size="sm" />
                  <Logo size={120} />
                  <div className="h-24 w-px bg-primary/30" />
                  <div>
                    <TitleText size="2xl" />
                    <p className="text-gray-400 text-xl mt-2">Plan • Track • Assess</p>
                  </div>
                </div>
              </AssetContainer>

              {/* T6: Split design */}
              <AssetContainer id="tw-6" {...FORMATS.twitter}>
                <div className="w-full h-full flex relative">
                  <div className="w-1/2 bg-slate-900 flex items-center justify-center">
                    <div className="text-center">
                      <Logo size={100} className="mx-auto mb-4" />
                      <TitleText size="xl" />
                      <p className="text-gray-400 mt-2">Your game day toolkit</p>
                      <SiteUrl className="mt-3" size="sm" />
                    </div>
                  </div>
                  <div className="w-1/2 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                    <ThreePhones leftSize="sm" middleSize="lg" rightSize="sm" overlap={16} stagger={20} />
                  </div>
                </div>
              </AssetContainer>

              {/* T7: Bottom aligned phones */}
              <AssetContainer id="tw-7" {...FORMATS.twitter}>
                <div className="w-full h-full bg-slate-900 relative overflow-hidden">
                  <SiteUrl className="absolute bottom-4 left-16 z-20" size="sm" />
                  <div className="absolute top-8 left-16 flex items-center gap-5">
                    <Logo size={70} />
                    <TitleText size="xl" />
                  </div>
                  <div className="absolute bottom-0 right-16 flex items-end">
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
                      size="md"
                      style={{ marginRight: -20, transform: 'translateY(40px)' }}
                      zIndex={1}
                    />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
                      size="lg"
                      style={{ transform: 'translateY(20px)' }}
                      zIndex={10}
                    />
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
                      size="md"
                      style={{ marginLeft: -20, transform: 'translateY(40px)' }}
                      zIndex={1}
                    />
                  </div>
                </div>
              </AssetContainer>

              {/* T8: Stats focus */}
              <AssetContainer id="tw-8" {...FORMATS.twitter}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex items-center px-16 relative">
                  <SiteUrl className="absolute bottom-4 right-6" size="sm" />
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="xl" zIndex={10} />
                  <div className="ml-16">
                    <div className="flex items-center gap-4 mb-4">
                      <Logo size={70} />
                      <TitleText size="xl" />
                    </div>
                    <h3 className="text-white text-2xl font-semibold mb-2">Track Player Development</h3>
                    <p className="text-gray-400">
                      Comprehensive statistics across games, seasons, and tournaments.
                    </p>
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* FACEBOOK COVERS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Facebook Covers (820×312)
            </h2>

            <div className="space-y-8">
              <AssetContainer id="fb-1" {...FORMATS.facebook}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center justify-between px-12 relative">
                  <div className="flex items-center gap-4">
                    <Logo size={60} />
                    <div>
                      <TitleText size="lg" />
                      <p className="text-gray-400 text-sm mt-1">Your game day toolkit</p>
                      <SiteUrl className="mt-1" size="sm" />
                    </div>
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="md" zIndex={10} />
                </div>
              </AssetContainer>

              <AssetContainer id="fb-2" {...FORMATS.facebook}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-center gap-8 relative">
                  <Logo size={70} />
                  <div>
                    <TitleText size="xl" />
                    <p className="text-gray-400 mt-1">Plan • Track • Assess</p>
                    <SiteUrl className="mt-2" size="sm" />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="fb-3" {...FORMATS.facebook}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="lg" blur={100} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-12">
                    <div className="flex items-center gap-4">
                      <Logo size={55} />
                      <div>
                        <TitleText size="lg" />
                        <SiteUrl className="mt-1" size="sm" />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <PhoneMockup
                        screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg"
                        size="md"
                        zIndex={10}
                      />
                      <PhoneMockup
                        screenshot="/screenshots/MatchOps_Main_timer_full.jpg"
                        size="sm"
                        style={{ marginLeft: -15, transform: 'translateY(10px)' }}
                        zIndex={1}
                      />
                    </div>
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="fb-4" {...FORMATS.facebook}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-primary/10 flex items-center px-12 relative">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Logo size={50} />
                      <TitleText size="md" />
                    </div>
                    <FeatureBullets features={['Offline', 'Private', 'No Signup']} size="sm" />
                    <SiteUrl className="mt-2" size="sm" />
                  </div>
                  <ThreePhones leftSize="xs" middleSize="sm" rightSize="xs" overlap={10} stagger={10} />
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* OPEN GRAPH / SOCIAL SHARE */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Open Graph / Social Share (1200×630)
            </h2>

            <div className="space-y-8">
              {/* OG1: Main showcase */}
              <AssetContainer id="og-1" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="lg" blur={100} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-16">
                    <div>
                      <div className="flex items-center gap-5 mb-4">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <p className="text-gray-300 text-2xl mb-6">Local-first soccer coaching app</p>
                      <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Account Needed']} size="lg" />
                      <SiteUrl className="mt-4" size="sm" />
                    </div>
                    <ThreePhones leftSize="md" middleSize="xl" rightSize="md" overlap={25} stagger={30} />
                  </div>
                </div>
              </AssetContainer>

              {/* OG1-ALT: Main showcase - same size phones, aligned */}
              <AssetContainer id="og-1-alt" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="lg" blur={100} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-16">
                    <div>
                      <div className="flex items-center gap-5 mb-4">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <p className="text-gray-300 text-2xl mb-6">Local-first soccer coaching app</p>
                      <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Account Needed']} size="lg" />
                      <SiteUrl className="mt-4" size="sm" />
                    </div>
                    <ThreePhonesBalanced sideSize="lg" middleSize="lg" overlap={25} />
                  </div>
                </div>
              </AssetContainer>

              {/* OG1-ALT2: Main showcase - center slightly bigger, aligned */}
              <AssetContainer id="og-1-alt2" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="lg" blur={100} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-16">
                    <div>
                      <div className="flex items-center gap-5 mb-4">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <p className="text-gray-300 text-2xl mb-6">Local-first soccer coaching app</p>
                      <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Account Needed']} size="lg" />
                      <SiteUrl className="mt-4" size="sm" />
                    </div>
                    <ThreePhonesBalanced sideSize="md" middleSize="lg" overlap={22} />
                  </div>
                </div>
              </AssetContainer>

              {/* OG2: Features grid */}
              <AssetContainer id="og-2" {...FORMATS.openGraph}>
                <div className="w-full h-full flex relative">
                  <div className="w-2/5 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-8">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="xl" zIndex={10} />
                  </div>
                  <div className="w-3/5 bg-slate-900 flex flex-col justify-center px-12">
                    <div className="flex items-center gap-4 mb-6">
                      <Logo size={60} />
                      <TitleText size="xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-primary font-semibold text-lg mb-1">Interactive Field</div>
                        <div className="text-gray-400">Plan lineups visually</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-primary font-semibold text-lg mb-1">Game Timer</div>
                        <div className="text-gray-400">Track substitutions</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-primary font-semibold text-lg mb-1">Live Events</div>
                        <div className="text-gray-400">Log goals & assists</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-primary font-semibold text-lg mb-1">Statistics</div>
                        <div className="text-gray-400">Season analytics</div>
                      </div>
                    </div>
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                </div>
              </AssetContainer>

              {/* OG3: Dramatic dark */}
              <AssetContainer id="og-3" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-black relative overflow-hidden">
                  <GlowBg color="primary" position="center" size="xl" blur={150} />
                  <div className="relative z-10 w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <Logo size={100} className="mx-auto mb-6" />
                      <TitleText size="3xl" className="block mb-4" />
                      <p className="text-gray-300 text-2xl mb-8">Your game day toolkit</p>
                      <p className="text-gray-500 text-lg">Plan • Track • Assess</p>
                      <SiteUrl className="mt-4" size="sm" />
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* OG4: Side by side phones */}
              <AssetContainer id="og-4" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center px-12 relative">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <Logo size={70} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-300 text-xl mb-6">
                      Replace clipboard, stopwatch, and notebook with one app.
                    </p>
                    <FeatureBullets features={['No Signup', 'Works Offline', 'Data Stays Private']} />
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                  <div className="flex gap-4">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                    <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="lg" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              {/* OG5: Minimal */}
              <AssetContainer id="og-5" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-center relative">
                  <div className="flex items-center gap-8">
                    <Logo size={120} />
                    <div>
                      <TitleText size="2xl" className="block" />
                      <p className="text-gray-400 text-xl mt-2">Local-first soccer coaching app</p>
                      <SiteUrl className="mt-2" size="sm" />
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* OG6: Three screens showcase */}
              <AssetContainer id="og-6" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="bottom-left" size="lg" blur={120} />
                  <GlowBg color="amber" position="top-right" size="md" blur={80} />
                  <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                    <div className="flex items-center gap-4 mb-8">
                      <Logo size={60} />
                      <TitleText size="xl" />
                      <SiteUrl className="ml-4" size="sm" />
                    </div>
                    <ThreePhones leftSize="md" middleSize="xl" rightSize="md" overlap={30} stagger={35} />
                  </div>
                </div>
              </AssetContainer>

              {/* OG7: Coach focused */}
              <AssetContainer id="og-7" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center px-16 relative">
                  <div className="flex-1">
                    <p className="text-primary text-lg mb-2">For Soccer Coaches</p>
                    <h2 className="text-white text-4xl font-bold mb-4">
                      Focus on coaching,
                      <br />
                      not paperwork
                    </h2>
                    <div className="flex items-center gap-4 mt-6">
                      <Logo size={50} />
                      <TitleText size="lg" />
                    </div>
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="xl" zIndex={10} />
                </div>
              </AssetContainer>

              {/* OG8: Stats highlight */}
              <AssetContainer id="og-8" {...FORMATS.openGraph}>
                <div className="w-full h-full bg-slate-900 flex relative">
                  <div className="w-1/2 flex items-center justify-center">
                    <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="xl" zIndex={10} />
                  </div>
                  <div className="w-1/2 flex flex-col justify-center pr-16">
                    <div className="flex items-center gap-3 mb-4">
                      <Logo size={50} />
                      <TitleText size="lg" />
                    </div>
                    <h3 className="text-white text-3xl font-bold mb-3">Build Statistics Automatically</h3>
                    <p className="text-gray-400 text-lg mb-4">
                      Every goal, assist, and game event builds your season statistics. Track player development over
                      time.
                    </p>
                    <FeatureBullets features={['Player Stats', 'Team Stats', 'Season Trends']} size="sm" />
                    <SiteUrl className="mt-4" size="sm" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* INSTAGRAM POSTS (SQUARE) */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Instagram Posts (1080×1080)
            </h2>

            <div className="flex flex-wrap gap-8">
              {/* IG1: Single phone hero */}
              <AssetContainer id="ig-1" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <Logo size={50} />
                    <TitleText size="md" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="md" zIndex={10} />
                  <p className="text-gray-400 text-lg mt-4">Plan • Track • Assess</p>
                  <SiteUrl className="mt-4" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              {/* IG2: Feature - Plan */}
              <AssetContainer id="ig-2" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <p className="text-primary text-xl font-bold mb-1">PLAN</p>
                  <h3 className="text-white text-2xl font-bold mb-4 text-center">Interactive Lineup</h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="md" zIndex={10} />
                  <div className="mt-4 flex items-center gap-2">
                    <Logo size={30} />
                    <TitleText size="xs" />
                  </div>
                  <SiteUrl className="mt-2" size="sm" />
                </div>
              </AssetContainer>

              {/* IG3: Feature - Track */}
              <AssetContainer id="ig-3" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <p className="text-primary text-xl font-bold mb-1">TRACK</p>
                  <h3 className="text-white text-2xl font-bold mb-4 text-center">Live Game Events</h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="md" zIndex={10} />
                  <div className="mt-4 flex items-center gap-2">
                    <Logo size={30} />
                    <TitleText size="xs" />
                  </div>
                  <SiteUrl className="mt-2" size="sm" />
                </div>
              </AssetContainer>

              {/* IG4: Feature - Assess */}
              <AssetContainer id="ig-4" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <p className="text-primary text-xl font-bold mb-1">ASSESS</p>
                  <h3 className="text-white text-2xl font-bold mb-4 text-center">Player Statistics</h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="md" zIndex={10} />
                  <div className="mt-4 flex items-center gap-2">
                    <Logo size={30} />
                    <TitleText size="xs" />
                  </div>
                  <SiteUrl className="mt-2" size="sm" />
                </div>
              </AssetContainer>

              {/* IG5: Logo centered */}
              <AssetContainer id="ig-5" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <Logo size={120} className="mb-4" />
                  <TitleText size="lg" className="mb-3" />
                  <p className="text-gray-400 text-lg">Plan • Track • Assess</p>
                  <SiteUrl className="mt-6" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              {/* IG6: Benefits list */}
              <AssetContainer id="ig-6" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-8">
                    <Logo size={45} />
                    <TitleText size="md" />
                  </div>
                  <div className="space-y-3 text-lg">
                    <div className="flex items-center gap-3 text-white">
                      <span className="w-3 h-3 bg-primary rounded-full flex-shrink-0" />
                      Works offline
                    </div>
                    <div className="flex items-center gap-3 text-white">
                      <span className="w-3 h-3 bg-primary rounded-full flex-shrink-0" />
                      Data stays on device
                    </div>
                    <div className="flex items-center gap-3 text-white">
                      <span className="w-3 h-3 bg-primary rounded-full flex-shrink-0" />
                      No signup required
                    </div>
                  </div>
                  <SiteUrl className="mt-8" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              {/* IG7: Quote style */}
              <AssetContainer id="ig-7" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center px-16">
                  <p className="text-4xl text-primary mb-3">&ldquo;</p>
                  <p className="text-white text-xl text-center leading-relaxed mb-4">
                    Your clipboard, stopwatch, and notebook in one app.
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <Logo size={30} />
                    <TitleText size="xs" />
                  </div>
                  <SiteUrl size="lg" variant="primary" />
                </div>
              </AssetContainer>

              {/* IG8: Tagline */}
              <AssetContainer id="ig-8" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <Logo size={70} className="mb-4" />
                  <TitleText size="md" className="mb-3" />
                  <p className="text-gray-300 text-lg text-center mb-1">Your game day toolkit</p>
                  <p className="text-gray-500 text-base">for soccer coaches</p>
                  <SiteUrl className="mt-6" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              {/* IG9: Split design */}
              <AssetContainer id="ig-9" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full flex flex-col">
                  <div className="flex-1 bg-primary flex items-center justify-center">
                    <h3 className="text-slate-900 text-3xl font-bold text-center">
                      Your Game Day
                      <br />
                      Toolkit
                    </h3>
                  </div>
                  <div className="flex-1 bg-slate-900 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-3 mb-3">
                      <Logo size={40} />
                      <TitleText size="sm" />
                    </div>
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>

              {/* IG10: Timer screenshot */}
              <AssetContainer id="ig-10" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-2 mb-4">
                    <Logo size={40} />
                    <TitleText size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="md" zIndex={10} />
                  <p className="text-gray-400 text-base mt-4">Track games in real-time</p>
                  <SiteUrl className="mt-2" size="sm" />
                </div>
              </AssetContainer>

              {/* IG11: Stats screenshot */}
              <AssetContainer id="ig-11" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-2 mb-4">
                    <Logo size={40} />
                    <TitleText size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="md" zIndex={10} />
                  <p className="text-gray-400 text-base mt-4">Build statistics automatically</p>
                  <SiteUrl className="mt-2" size="sm" />
                </div>
              </AssetContainer>

              {/* IG12: Privacy focus */}
              <AssetContainer id="ig-12" {...FORMATS.instagramPost} scale={0.5}>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <Logo size={60} className="mb-4" />
                  <TitleText size="md" className="mb-4" />
                  <p className="text-white text-xl text-center mb-1">Your data stays</p>
                  <p className="text-primary text-2xl font-bold text-center">on your device</p>
                  <p className="text-gray-500 text-base mt-3">Privacy by design</p>
                  <SiteUrl className="mt-6" size="lg" variant="primary" />
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* INSTAGRAM STORIES */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Instagram Stories (1080×1920)
            </h2>

            <div className="flex flex-wrap gap-8">
              {/* Story 1: Main showcase */}
              <AssetContainer id="story-1" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-6">
                    <Logo size={60} />
                    <TitleText size="lg" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  <p className="text-gray-300 text-xl mt-6">Your game day toolkit</p>
                  <p className="text-gray-500 text-lg mt-2">Plan • Track • Assess</p>
                  <div className="mt-8 bg-primary/20 px-6 py-2 rounded-full">
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>

              {/* Story 2: Feature - Plan */}
              <AssetContainer id="story-2" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <Logo size={40} />
                    <TitleText size="md" />
                  </div>
                  <p className="text-primary text-2xl font-bold mb-2">PLAN</p>
                  <h3 className="text-white text-3xl font-bold mb-6 text-center">
                    Interactive
                    <br />
                    Soccer Field
                  </h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  <p className="text-gray-400 text-lg mt-6">Build your lineup visually</p>
                  <SiteUrl className="mt-4" size="md" />
                </div>
              </AssetContainer>

              {/* Story 3: Feature - Track */}
              <AssetContainer id="story-3" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <Logo size={40} />
                    <TitleText size="md" />
                  </div>
                  <p className="text-primary text-2xl font-bold mb-2">TRACK</p>
                  <h3 className="text-white text-3xl font-bold mb-6 text-center">
                    Live Game
                    <br />
                    Timer & Events
                  </h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="lg" zIndex={10} />
                  <p className="text-gray-400 text-lg mt-6">Log goals with a tap</p>
                  <SiteUrl className="mt-4" size="md" />
                </div>
              </AssetContainer>

              {/* Story 4: Feature - Assess */}
              <AssetContainer id="story-4" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <Logo size={40} />
                    <TitleText size="md" />
                  </div>
                  <p className="text-primary text-2xl font-bold mb-2">ASSESS</p>
                  <h3 className="text-white text-3xl font-bold mb-6 text-center">
                    Player &
                    <br />
                    Team Statistics
                  </h3>
                  <PhoneMockup screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg" size="lg" zIndex={10} />
                  <p className="text-gray-400 text-lg mt-6">Track development over time</p>
                  <SiteUrl className="mt-4" size="md" />
                </div>
              </AssetContainer>

              {/* Story 5: Bold text */}
              <AssetContainer id="story-5" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <Logo size={80} className="mb-8" />
                  <h2 className="text-white text-4xl font-bold mb-6 leading-tight text-center">
                    Your clipboard,
                    <br />
                    stopwatch &
                    <br />
                    notebook
                    <br />
                    <span className="text-primary">in one app</span>
                  </h2>
                  <TitleText size="lg" className="mt-6" />
                  <div className="mt-8 bg-primary/20 px-6 py-2 rounded-full">
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>

              {/* Story 6: Benefits list */}
              <AssetContainer id="story-6" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <div className="flex items-center gap-3 mb-12">
                    <Logo size={50} />
                    <TitleText size="lg" />
                  </div>
                  <div className="space-y-6 text-xl">
                    <div className="flex items-center gap-4">
                      <span className="w-4 h-4 bg-primary rounded-full flex-shrink-0" />
                      <span className="text-white">Works offline</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-4 h-4 bg-primary rounded-full flex-shrink-0" />
                      <span className="text-white">Data stays on device</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="w-4 h-4 bg-primary rounded-full flex-shrink-0" />
                      <span className="text-white">No signup required</span>
                    </div>
                  </div>
                  <div className="mt-12 bg-primary/20 px-6 py-2 rounded-full">
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>

              {/* Story 7: Quote */}
              <AssetContainer id="story-7" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                  <p className="text-6xl text-primary mb-4">&ldquo;</p>
                  <p className="text-white text-2xl text-center leading-relaxed mb-8">
                    Focus on coaching,
                    <br />
                    not paperwork
                  </p>
                  <div className="flex items-center gap-3">
                    <Logo size={40} />
                    <TitleText size="md" />
                  </div>
                  <div className="mt-10 bg-primary/20 px-6 py-2 rounded-full">
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>

              {/* Story 8: Privacy */}
              <AssetContainer id="story-8" {...FORMATS.instagramStory} scale={0.35}>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <Logo size={70} className="mb-8" />
                  <TitleText size="lg" className="mb-8" />
                  <p className="text-white text-3xl text-center mb-2">Your data stays</p>
                  <p className="text-primary text-4xl font-bold text-center">on your device</p>
                  <p className="text-gray-500 text-lg mt-6">Privacy by design</p>
                  <div className="mt-10 bg-primary/20 px-6 py-2 rounded-full">
                    <SiteUrl size="lg" variant="primary" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* APP STORE FEATURE GRAPHICS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              App Store Feature Graphics (1024×500)
            </h2>

            <div className="space-y-8">
              {/* AS1: Main */}
              <AssetContainer id="as-1" {...FORMATS.appStoreFeature}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-16 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-5"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-center gap-5 mb-4">
                      <Logo size={70} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-300 text-xl mb-4">Your game day toolkit</p>
                    <p className="text-gray-500 mb-3">Plan Lineups • Track Games • Build Statistics</p>
                    <SiteUrl size="sm" />
                  </div>
                  <div className="relative z-10">
                    <ThreePhones leftSize="sm" middleSize="lg" rightSize="sm" overlap={16} stagger={20} />
                  </div>
                </div>
              </AssetContainer>

              {/* AS2: Dark glow */}
              <AssetContainer id="as-2" {...FORMATS.appStoreFeature}>
                <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
                  <GlowBg color="primary" position="center" size="lg" blur={120} />
                  <div className="relative z-10 flex items-center gap-16">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="xl" zIndex={10} />
                    <div>
                      <Logo size={80} className="mb-4" />
                      <TitleText size="2xl" className="block mb-2" />
                      <p className="text-gray-400 text-lg mb-3">Local-first soccer coaching app</p>
                      <SiteUrl size="sm" />
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* AS3: Three features */}
              <AssetContainer id="as-3" {...FORMATS.appStoreFeature}>
                <div className="w-full h-full bg-slate-900 flex items-center px-12 relative">
                  <div className="flex flex-col gap-2 mr-12">
                    <div className="flex items-center gap-4">
                      <Logo size={60} />
                      <TitleText size="lg" />
                    </div>
                    <SiteUrl size="sm" />
                  </div>
                  <div className="flex-1 flex justify-around">
                    <div className="text-center">
                      <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="md" zIndex={10} />
                      <p className="text-primary mt-3 font-semibold">Plan</p>
                    </div>
                    <div className="text-center">
                      <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="md" zIndex={10} />
                      <p className="text-primary mt-3 font-semibold">Track</p>
                    </div>
                    <div className="text-center">
                      <PhoneMockup
                        screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
                        size="md"
                        zIndex={10}
                      />
                      <p className="text-primary mt-3 font-semibold">Assess</p>
                    </div>
                  </div>
                </div>
              </AssetContainer>

              {/* AS4: Minimal */}
              <AssetContainer id="as-4" {...FORMATS.appStoreFeature}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center justify-center gap-10 relative">
                  <Logo size={100} />
                  <div className="h-20 w-px bg-primary/30" />
                  <div>
                    <TitleText size="2xl" />
                    <p className="text-gray-400 text-lg mt-2 mb-2">Plan • Track • Assess</p>
                    <SiteUrl size="sm" />
                  </div>
                </div>
              </AssetContainer>

              {/* AS5: Side phone */}
              <AssetContainer id="as-5" {...FORMATS.appStoreFeature}>
                <div className="w-full h-full bg-slate-900 flex relative">
                  <div className="w-2/5 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="xl" zIndex={10} />
                  </div>
                  <div className="w-3/5 flex flex-col justify-center px-12">
                    <div className="flex items-center gap-4 mb-4">
                      <Logo size={60} />
                      <TitleText size="xl" />
                    </div>
                    <p className="text-gray-300 text-lg mb-4">
                      Replace clipboard, stopwatch, and notebook with one app.
                    </p>
                    <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Signup']} size="sm" />
                    <SiteUrl size="sm" className="mt-3" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* PROMOTIONAL CARDS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Promotional Cards (Various Sizes)
            </h2>

            <div className="flex flex-wrap gap-8">
              {/* Feature cards */}
              <AssetContainer id="card-plan" width={600} height={400} name="Feature Card - Plan">
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex relative">
                  <div className="w-1/2 flex flex-col justify-center">
                    <div className="text-primary text-sm font-semibold mb-2">FEATURE</div>
                    <h3 className="text-white text-3xl font-bold mb-3">Plan Your Lineup</h3>
                    <p className="text-gray-400 mb-3">
                      Select and place players on an interactive soccer field. Visualize formations before the game.
                    </p>
                    <SiteUrl size="sm" />
                  </div>
                  <div className="w-1/2 flex items-center justify-center">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="card-track" width={600} height={400} name="Feature Card - Track">
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex relative">
                  <div className="w-1/2 flex flex-col justify-center">
                    <div className="text-primary text-sm font-semibold mb-2">FEATURE</div>
                    <h3 className="text-white text-3xl font-bold mb-3">Track Live Games</h3>
                    <p className="text-gray-400 mb-3">
                      Game timer with substitution intervals. Log goals, assists, and events with a tap.
                    </p>
                    <SiteUrl size="sm" />
                  </div>
                  <div className="w-1/2 flex items-center justify-center">
                    <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="lg" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="card-stats" width={600} height={400} name="Feature Card - Statistics">
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex relative">
                  <div className="w-1/2 flex flex-col justify-center">
                    <div className="text-primary text-sm font-semibold mb-2">FEATURE</div>
                    <h3 className="text-white text-3xl font-bold mb-3">Review Statistics</h3>
                    <p className="text-gray-400 mb-3">
                      Comprehensive player, team and competition statistics. Track performance across seasons.
                    </p>
                    <SiteUrl size="sm" />
                  </div>
                  <div className="w-1/2 flex items-center justify-center">
                    <PhoneMockup
                      screenshot="/screenshots/MatchOps_Main_playerstats_full.jpg"
                      size="lg"
                      zIndex={10}
                    />
                  </div>
                </div>
              </AssetContainer>

              {/* Square promo cards */}
              <AssetContainer id="card-sq-1" width={400} height={400} name="Square Card - Logo">
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center relative">
                  <Logo size={120} className="mb-6" />
                  <TitleText size="lg" />
                  <SiteUrl className="mt-6" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              <AssetContainer id="card-sq-2" width={400} height={400} name="Square Card - Tagline">
                <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-8 relative">
                  <Logo size={80} className="mb-4" />
                  <TitleText size="lg" className="mb-4" />
                  <p className="text-gray-400 text-center">Plan • Track • Assess</p>
                  <SiteUrl className="mt-6" size="lg" variant="primary" />
                </div>
              </AssetContainer>

              <AssetContainer id="card-sq-3" width={400} height={400} name="Square Card - Phone">
                <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
                  <GlowBg color="primary" position="bottom-right" size="md" blur={80} />
                  <div className="relative z-10 flex items-center gap-2 mb-4">
                    <Logo size={40} />
                    <TitleText size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  <SiteUrl className="relative z-20 mt-3" size="sm" />
                </div>
              </AssetContainer>

              {/* Wide banner */}
              <AssetContainer id="card-wide" width={800} height={200} name="Wide Banner">
                <div className="w-full h-full bg-gradient-to-r from-slate-900 to-slate-800 flex items-center justify-between px-12 relative">
                  <div className="flex items-center gap-5">
                    <Logo size={60} />
                    <div>
                      <TitleText size="lg" />
                      <p className="text-gray-400">Your game day toolkit</p>
                      <SiteUrl size="sm" className="mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="sm" zIndex={10} />
                    <PhoneMockup screenshot="/screenshots/MatchOps_Main_timer_full.jpg" size="sm" zIndex={10} />
                  </div>
                </div>
              </AssetContainer>

              {/* Tall card */}
              <AssetContainer id="card-tall" width={300} height={500} name="Tall Card">
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-between py-8 px-6 relative">
                  <div className="flex items-center gap-2">
                    <Logo size={40} />
                    <TitleText size="sm" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="lg" zIndex={10} />
                  <div className="text-center">
                    <p className="text-gray-400 text-sm mb-2">Plan • Track • Assess</p>
                    <SiteUrl size="md" variant="primary" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* LOGO LOCKUPS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Logo Lockups
            </h2>

            <div className="flex flex-wrap gap-8">
              <AssetContainer id="logo-dark" width={400} height={200} name="Logo on Dark">
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-2 relative">
                  <div className="flex items-center gap-4">
                    <Logo size={60} />
                    <TitleText size="lg" />
                  </div>
                  <SiteUrl size="sm" />
                </div>
              </AssetContainer>

              <AssetContainer id="logo-light" width={400} height={200} name="Logo on Light">
                <div className="w-full h-full bg-white flex flex-col items-center justify-center gap-2 relative">
                  <div className="flex items-center gap-4">
                    <Logo size={60} />
                    <TitleText size="lg" dark />
                  </div>
                  <SiteUrl size="sm" variant="dark" />
                </div>
              </AssetContainer>

              <AssetContainer id="logo-icon" width={200} height={200} name="Icon Only - Dark">
                <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                  <Logo size={120} />
                </div>
              </AssetContainer>

              <AssetContainer id="logo-icon-light" width={200} height={200} name="Icon Only - Light">
                <div className="w-full h-full bg-white flex items-center justify-center">
                  <Logo size={120} />
                </div>
              </AssetContainer>

              <AssetContainer id="logo-stacked" width={300} height={300} name="Stacked Logo">
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center relative">
                  <Logo size={100} className="mb-4" />
                  <TitleText size="lg" />
                  <SiteUrl size="sm" className="mt-3" />
                </div>
              </AssetContainer>

              <AssetContainer id="logo-tagline" width={500} height={200} name="Logo with Tagline">
                <div className="w-full h-full bg-slate-900 flex items-center justify-center gap-5 relative">
                  <Logo size={70} />
                  <div>
                    <TitleText size="xl" />
                    <p className="text-gray-400 mt-1">Local-first soccer coaching app</p>
                    <SiteUrl size="sm" className="mt-1" />
                  </div>
                </div>
              </AssetContainer>
            </div>
          </section>

          {/* ============================================ */}
          {/* HERO BANNERS */}
          {/* ============================================ */}
          <section className="mb-24">
            <h2 className="text-2xl font-bold text-primary mb-8 border-b border-gray-800 pb-4">
              Hero Banners (1920×600)
            </h2>

            <div className="space-y-8">
              <AssetContainer id="hero-1" width={1920} height={600} name="Hero - Dramatic" scale={0.7}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="xl" blur={150} />
                  <GlowBg color="amber" position="bottom-left" size="lg" blur={120} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-32">
                    <div className="max-w-xl">
                      <div className="flex items-center gap-4 mb-6">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <h1 className="text-5xl font-bold text-white mb-4">Your Game Day Toolkit</h1>
                      <p className="text-xl text-gray-400 mb-8">
                        Plan lineups, track games live, build statistics. Works offline. Your data stays private.
                      </p>
                      <div className="flex gap-4 items-center">
                        <div className="bg-primary text-slate-900 px-6 py-3 rounded-lg font-semibold">
                          Get Started
                        </div>
                        <div className="bg-slate-800 text-white px-6 py-3 rounded-lg">Learn More</div>
                        <SiteUrl className="ml-4" size="md" />
                      </div>
                    </div>
                    <ThreePhones leftSize="md" middleSize="xl" rightSize="md" overlap={30} stagger={35} />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="hero-2" width={1920} height={600} name="Hero - Clean" scale={0.7}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-32 relative">
                  <div className="max-w-lg">
                    <div className="flex items-center gap-5 mb-6">
                      <Logo size={90} />
                      <TitleText size="2xl" />
                    </div>
                    <p className="text-gray-300 text-2xl mb-4">
                      Replace clipboard, stopwatch, and notebook with one app.
                    </p>
                    <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Signup Required']} size="lg" />
                    <SiteUrl className="mt-4" size="md" />
                  </div>
                  <ThreePhones leftSize="lg" middleSize="xl" rightSize="lg" overlap={35} stagger={40} />
                </div>
              </AssetContainer>

              <AssetContainer id="hero-1-alt" width={1920} height={600} name="Hero - Dramatic (same size phones)" scale={0.7}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="xl" blur={150} />
                  <GlowBg color="amber" position="bottom-left" size="lg" blur={120} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-32">
                    <div className="max-w-xl">
                      <div className="flex items-center gap-4 mb-6">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <h1 className="text-5xl font-bold text-white mb-4">Your Game Day Toolkit</h1>
                      <p className="text-xl text-gray-400 mb-8">
                        Plan lineups, track games live, build statistics. Works offline. Your data stays private.
                      </p>
                      <div className="flex gap-4 items-center">
                        <div className="bg-primary text-slate-900 px-6 py-3 rounded-lg font-semibold">
                          Get Started
                        </div>
                        <div className="bg-slate-800 text-white px-6 py-3 rounded-lg">Learn More</div>
                        <SiteUrl className="ml-4" size="md" />
                      </div>
                    </div>
                    <ThreePhonesBalanced sideSize="lg" middleSize="lg" overlap={30} />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="hero-1-alt2" width={1920} height={600} name="Hero - Dramatic (center slightly bigger)" scale={0.7}>
                <div className="w-full h-full bg-slate-950 relative overflow-hidden">
                  <GlowBg color="primary" position="top-right" size="xl" blur={150} />
                  <GlowBg color="amber" position="bottom-left" size="lg" blur={120} />
                  <div className="relative z-10 w-full h-full flex items-center justify-between px-32">
                    <div className="max-w-xl">
                      <div className="flex items-center gap-4 mb-6">
                        <Logo size={80} />
                        <TitleText size="2xl" />
                      </div>
                      <h1 className="text-5xl font-bold text-white mb-4">Your Game Day Toolkit</h1>
                      <p className="text-xl text-gray-400 mb-8">
                        Plan lineups, track games live, build statistics. Works offline. Your data stays private.
                      </p>
                      <div className="flex gap-4 items-center">
                        <div className="bg-primary text-slate-900 px-6 py-3 rounded-lg font-semibold">
                          Get Started
                        </div>
                        <div className="bg-slate-800 text-white px-6 py-3 rounded-lg">Learn More</div>
                        <SiteUrl className="ml-4" size="md" />
                      </div>
                    </div>
                    <ThreePhonesBalanced sideSize="lg" middleSize="xl" overlap={30} />
                  </div>
                </div>
              </AssetContainer>

              <AssetContainer id="hero-2-alt" width={1920} height={600} name="Hero - Clean (same size phones)" scale={0.7}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-32 relative">
                  <div className="max-w-lg">
                    <div className="flex items-center gap-5 mb-6">
                      <Logo size={90} />
                      <TitleText size="2xl" />
                    </div>
                    <p className="text-gray-300 text-2xl mb-4">
                      Replace clipboard, stopwatch, and notebook with one app.
                    </p>
                    <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Signup Required']} size="lg" />
                    <SiteUrl className="mt-4" size="md" />
                  </div>
                  <ThreePhonesBalanced sideSize="xl" middleSize="xl" overlap={35} />
                </div>
              </AssetContainer>

              <AssetContainer id="hero-2-alt2" width={1920} height={600} name="Hero - Clean (center slightly bigger)" scale={0.7}>
                <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between px-32 relative">
                  <div className="max-w-lg">
                    <div className="flex items-center gap-5 mb-6">
                      <Logo size={90} />
                      <TitleText size="2xl" />
                    </div>
                    <p className="text-gray-300 text-2xl mb-4">
                      Replace clipboard, stopwatch, and notebook with one app.
                    </p>
                    <FeatureBullets features={['Works Offline', 'Privacy-First', 'No Signup Required']} size="lg" />
                    <SiteUrl className="mt-4" size="md" />
                  </div>
                  <ThreePhonesBalanced sideSize="lg" middleSize="xl" overlap={32} />
                </div>
              </AssetContainer>

              <AssetContainer id="hero-3" width={1920} height={600} name="Hero - Minimal" scale={0.7}>
                <div className="w-full h-full bg-slate-900 flex items-center justify-center gap-20 relative">
                  <div className="text-center">
                    <Logo size={120} className="mx-auto mb-6" />
                    <TitleText size="3xl" className="block mb-4" />
                    <p className="text-gray-400 text-2xl">Plan • Track • Assess</p>
                    <SiteUrl className="mt-4" size="md" />
                  </div>
                  <PhoneMockup screenshot="/screenshots/MatchOps_main_soccerfield_full.jpg" size="2xl" zIndex={10} />
                </div>
              </AssetContainer>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
