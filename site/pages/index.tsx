import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import TechBadge from '@/components/TechBadge';
import FeaturesSections from '@/components/FeaturesSections';
import Link from 'next/link';
import Image from 'next/image';
import { FaLock, FaBolt, FaDollarSign, FaWifi, FaChartLine, FaCreditCard, FaServer, FaShieldAlt, FaFutbol, FaClock, FaPencilAlt, FaUsers, FaTrophy } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function Home() {
  const { t } = useTranslation('common');
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 md:py-28 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="container-custom relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Floating Badges */}
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <span className="floating-badge">
                <FaLock className="text-sm" />
                100% Private
              </span>
              <span className="floating-badge">
                <FaBolt className="text-sm" />
                Works Offline
              </span>
              <span className="floating-badge">
                <FaDollarSign className="text-sm" />
                Free Forever
              </span>
            </div>

            {/* Logo */}
            <div className="mb-8 flex justify-center animate-float">
              <div className="relative h-24 md:h-32 w-24 md:w-32 logo-glow">
                <Image
                  src="/logos/app-logo-yellow.png"
                  alt="MatchOps-Local Logo"
                  fill
                  sizes="(max-width: 768px) 6rem, 8rem"
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-white">
              {t('home.hero.title')}
            </h1>

            <p className="text-lg md:text-xl text-slate-200 mb-4 leading-relaxed">
              {t('home.hero.subtitle')}
            </p>

            <p className="text-base md:text-lg text-slate-300 mb-10">
              {t('home.hero.subtitleBold')}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <a
                href="https://matchops.app"
                className="btn btn-primary text-lg px-8 py-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('home.hero.tryItNow')} →
              </a>
              <a
                href="#features"
                className="btn btn-secondary text-lg px-8 py-4 border-2 border-slate-600 hover:border-primary hover:bg-slate-700"
              >
                {t('home.hero.seeHowItWorks')}
              </a>
            </div>

            {/* Trust Signals */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400 mb-12 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-2">
                <FaShieldAlt className="text-green-500" />
                <span>Open Source</span>
              </div>
              <div className="flex items-center gap-2">
                <FaServer className="text-blue-500" />
                <span>No Servers</span>
              </div>
              <div className="flex items-center gap-2">
                <FaChartLine className="text-primary" />
                <span>Advanced Stats</span>
              </div>
            </div>

            {/* Hero Screenshot */}
            <div className="mt-12 max-w-4xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary via-indigo-500 to-primary rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative rounded-xl shadow-2xl border border-slate-600 overflow-hidden bg-slate-800">
                  <Image
                    src="/screenshots/ChatGPT Image Oct 27, 2025, 07_12_08 PM.png"
                    alt="MatchOps-Local App Interface"
                    width={1920}
                    height={1080}
                    className="w-full h-auto object-contain"
                    priority
                    quality={95}
                  />
                </div>
              </div>
            </div>

            {/* Hero Points */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
              <div className="flex flex-col items-center p-6 rounded-lg bg-slate-800/50 backdrop-blur border border-slate-700 hover:border-primary/50 transition-all duration-300 hover:transform hover:-translate-y-1">
                <div className="p-3 bg-primary/10 rounded-full mb-4">
                  <FaLock className="text-primary text-3xl" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{t('home.hero.privacyTitle')}</h3>
                <p className="text-sm text-slate-300 text-center">{t('home.hero.privacyDesc')}</p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-slate-800/50 backdrop-blur border border-slate-700 hover:border-indigo-500/50 transition-all duration-300 hover:transform hover:-translate-y-1">
                <div className="p-3 bg-indigo-500/10 rounded-full mb-4">
                  <FaBolt className="text-indigo-400 text-3xl" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{t('home.hero.offlineTitle')}</h3>
                <p className="text-sm text-slate-300 text-center">{t('home.hero.offlineDesc')}</p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-slate-800/50 backdrop-blur border border-slate-700 hover:border-green-500/50 transition-all duration-300 hover:transform hover:-translate-y-1">
                <div className="p-3 bg-green-500/10 rounded-full mb-4">
                  <FaDollarSign className="text-green-400 text-3xl" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{t('home.hero.freeTitle')}</h3>
                <p className="text-sm text-slate-300 text-center">{t('home.hero.freeDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Local-First section removed as requested */}

      <FeaturesSections />

      {/* Feature Highlights */}
      <section id="features" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('home.features.title')}
            </h2>
            <p className="text-xl text-slate-200 max-w-3xl mx-auto">
              {t('home.features.subtitle')}
            </p>
          </div>

          {/* Feature screenshots removed */}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="card">
              <div className="p-3 bg-primary/10 rounded-full w-fit mb-4">
                <FaFutbol className="text-primary text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.interactiveFieldTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.interactiveFieldDesc')}
              </p>
            </div>
            <div className="card">
              <div className="p-3 bg-indigo-500/10 rounded-full w-fit mb-4">
                <FaClock className="text-indigo-400 text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.timerTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.timerDesc')}
              </p>
            </div>
            <div className="card">
              <div className="p-3 bg-green-500/10 rounded-full w-fit mb-4">
                <FaChartLine className="text-green-400 text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.statsTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.statsDesc')}
              </p>
            </div>
            <div className="card">
              <div className="p-3 bg-purple-500/10 rounded-full w-fit mb-4">
                <FaPencilAlt className="text-purple-400 text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.tacticsTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.tacticsDesc')}
              </p>
            </div>
            <div className="card">
              <div className="p-3 bg-blue-500/10 rounded-full w-fit mb-4">
                <FaUsers className="text-blue-400 text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.multiTeamTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.multiTeamDesc')}
              </p>
            </div>
            <div className="card">
              <div className="p-3 bg-primary/10 rounded-full w-fit mb-4">
                <FaTrophy className="text-primary text-3xl" />
              </div>
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.seasonTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.seasonDesc')}
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/features" className="btn btn-primary">
              {t('home.features.exploreAll')}
            </Link>
          </div>
        </div>
      </section>

      {/* Screenshots Gallery */}
      <section className="py-20 bg-slate-900/50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-xl text-slate-200 max-w-3xl mx-auto">
              Real screenshots from the app showing key features
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-primary/50 transition-all">
              <Image
                src="/screenshots/Screenshot 2025-10-27 185821.png"
                alt="Interactive Soccer Field"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Interactive Field</p>
                  <p className="text-slate-300 text-sm">Drag & drop player positioning</p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-all">
              <Image
                src="/screenshots/Screenshot 2025-10-27 190449.png"
                alt="Game Timer & Events"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Live Timer</p>
                  <p className="text-slate-300 text-sm">Track game time & events</p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-green-500/50 transition-all">
              <Image
                src="/screenshots/Screenshot 2025-10-27 191313.png"
                alt="Player Statistics"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Advanced Stats</p>
                  <p className="text-slate-300 text-sm">Goals, assists, playing time</p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-purple-500/50 transition-all">
              <Image
                src="/screenshots/Screenshot 2025-10-27 191524.png"
                alt="Tactical Board"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Tactics Board</p>
                  <p className="text-slate-300 text-sm">Draw plays & strategies</p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-blue-500/50 transition-all">
              <Image
                src="/screenshots/Screenshot 2025-10-27 185158.png"
                alt="Team Management"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Team Management</p>
                  <p className="text-slate-300 text-sm">Manage multiple teams</p>
                </div>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-slate-700 hover:border-primary/50 transition-all">
              <Image
                src="/screenshots/StatsModalappInHandAtSoccerField.png"
                alt="Mobile PWA"
                width={400}
                height={300}
                className="w-full h-auto transform group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 p-4">
                  <p className="text-white font-bold">Works On Mobile</p>
                  <p className="text-slate-300 text-sm">PWA for any device</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              Why Choose MatchOps-Local?
            </h2>
            <p className="text-xl text-slate-200 max-w-3xl mx-auto">
              Compare to traditional methods and cloud alternatives
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-4 text-slate-300">Feature</th>
                    <th className="text-center p-4 text-primary font-bold">MatchOps-Local</th>
                    <th className="text-center p-4 text-slate-400">Paper Notes</th>
                    <th className="text-center p-4 text-slate-400">Cloud Apps</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-800">
                    <td className="p-4 text-slate-200">Works Offline</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                  </tr>
                  <tr className="border-b border-slate-800 bg-slate-800/30">
                    <td className="p-4 text-slate-200">Data Privacy</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-4 text-slate-200">Advanced Statistics</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                  </tr>
                  <tr className="border-b border-slate-800 bg-slate-800/30">
                    <td className="p-4 text-slate-200">Auto-calculations</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-4 text-slate-200">Free Forever</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                  </tr>
                  <tr className="border-b border-slate-800 bg-slate-800/30">
                    <td className="p-4 text-slate-200">No Signup Required</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                  </tr>
                  <tr className="bg-slate-800/30">
                    <td className="p-4 text-slate-200">Interactive Field</td>
                    <td className="text-center p-4"><span className="text-green-500 text-2xl">✓</span></td>
                    <td className="text-center p-4"><span className="text-red-500 text-2xl">✗</span></td>
                    <td className="text-center p-4"><span className="text-yellow-500 text-sm">Sometimes</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-slate-900/50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-slate-200 max-w-3xl mx-auto">
              Everything you need to know about MatchOps-Local
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Is it really free?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Yes! MatchOps-Local is 100% free and open source. No subscriptions, no hidden fees, no feature limits. All features are available to everyone.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Does it work offline?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Absolutely! Once installed as a PWA, the app works completely offline. All your data is stored locally on your device, so you can use it anywhere - even in stadiums with no internet.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Where is my data stored?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                All data is stored locally in your browser using IndexedDB. Nothing is sent to external servers. Your data stays on your device, giving you complete privacy and control.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Can I use it on mobile?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Yes! Install it as a PWA on iOS Safari or Android Chrome. It works like a native app with offline support, home screen icon, and full-screen mode.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">What if I switch devices?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                You can export your data as a backup file and import it on another device. The export includes all your teams, games, players, and statistics in a single JSON file.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">How many teams/players can I manage?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                There are no artificial limits. Manage as many teams, players, and games as you need. The app is designed to handle hundreds of players and games efficiently.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Is my data safe from loss?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Data is stored in IndexedDB which is persistent browser storage. We recommend regular exports as backups. Never use private/incognito mode as it doesn&apos;t support persistent storage.
              </p>
            </details>

            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Can I contribute to development?</span>
                <span className="text-primary group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-4 text-slate-300 leading-relaxed">
                Yes! MatchOps-Local is open source on GitHub. You can report issues, suggest features, or contribute code. Check out the GitHub repository for contribution guidelines.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* Technical Details Section */}
      <section className="py-16">
        <div className="container-custom">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">
              {t('home.technical.title')}
            </h2>
            <p className="text-slate-200">
              {t('home.technical.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
            <TechBadge name="React 19" />
            <TechBadge name="Next.js 15" />
            <TechBadge name="TypeScript" />
            <TechBadge name="IndexedDB" />
            <TechBadge name="PWA" />
            <TechBadge name="Tailwind CSS" />
          </div>
          <div className="text-center mt-8">
            <a
              href="https://github.com/VillePajala/MatchOps-Local"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-dark text-sm font-semibold"
            >
              {t('home.technical.viewSource')}
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-indigo-900/20 to-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Coaching?
            </h2>
            <p className="text-xl text-slate-200 mb-8 leading-relaxed">
              Join coaches who trust MatchOps-Local for game-day management. No signup, no fees, no limits.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a
                href="https://matchops.app"
                className="btn btn-primary text-lg px-10 py-5"
                target="_blank"
                rel="noopener noreferrer"
              >
                Launch App Now →
              </a>
              <Link
                href="/download"
                className="btn btn-secondary text-lg px-10 py-5 border-2 border-slate-600 hover:border-primary"
              >
                Installation Guide
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <FaShieldAlt className="text-green-500" />
                <span>100% Private</span>
              </div>
              <div className="flex items-center gap-2">
                <FaBolt className="text-indigo-400" />
                <span>Works Offline</span>
              </div>
              <div className="flex items-center gap-2">
                <FaDollarSign className="text-primary" />
                <span>Free Forever</span>
              </div>
              <div className="flex items-center gap-2">
                <FaShieldAlt className="text-blue-500" />
                <span>Open Source</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});
