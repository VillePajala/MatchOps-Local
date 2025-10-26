import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import Link from 'next/link';
import { FaLock, FaBolt, FaDollarSign, FaWifi, FaChartLine, FaCreditCard, FaServer, FaShieldAlt, FaFutbol, FaClock, FaPencilAlt, FaUsers, FaTrophy } from 'react-icons/fa';

export default function Home() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-20">
        <div className="container-custom">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Soccer Coaching Software That{' '}
              <span className="text-primary">Respects Your Privacy</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              Professional team management, statistics, and tactics—all on your device.
              <br />
              <strong>Professional features. Local-first. Complete control.</strong>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a
                href="https://matchops.app"
                className="btn btn-primary text-lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try It Now
              </a>
              <a
                href="#features"
                className="btn btn-outline text-lg"
              >
                See How It Works
              </a>
            </div>

            {/* Hero Points */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <div className="flex flex-col items-center">
                <FaLock className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Complete Privacy</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Zero data collection</p>
              </div>
              <div className="flex flex-col items-center">
                <FaBolt className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Works Offline</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">No internet required</p>
              </div>
              <div className="flex flex-col items-center">
                <FaDollarSign className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Get Started Free</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Free version available</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Local-First Section */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why Local-First?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Local-first architecture gives you control, privacy, and reliability
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Data Privacy & Control */}
            <div className="card border-2 border-green-200 dark:border-green-900">
              <FaShieldAlt className="text-green-500 text-3xl mb-4" />
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Data Privacy & Control
              </h3>
              <ul className="space-y-3 text-gray-600 dark:text-gray-400">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Your data stays on your device under your control</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>You know exactly where your data is and who has access</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Simple GDPR compliance—no external data transmission</span>
                </li>
              </ul>
            </div>

            {/* Works Anywhere */}
            <div className="card border-2 border-green-200 dark:border-green-900">
              <FaBolt className="text-green-500 text-3xl mb-4" />
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                Works Anywhere
              </h3>
              <ul className="space-y-3 text-gray-600 dark:text-gray-400">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Works perfectly offline, even at remote fields</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Access all your data anytime, no internet required</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Battery efficient—no constant syncing</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              The Local-First Solution
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              MatchOps-Local puts you in complete control of your team data
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FaShieldAlt />}
              title="Your Device, Your Data"
              description="All data stored locally in your browser. No external servers, no data collection, no tracking."
              highlights={[
                'Export anytime',
                'Own it forever',
                'Complete control'
              ]}
            />
            <FeatureCard
              icon={<FaBolt />}
              title="Sideline Ready"
              description="Works perfectly without internet connection. Instant response times and battery efficiency."
              highlights={[
                'Full offline mode',
                '<50ms response',
                'Battery efficient'
              ]}
            />
            <FeatureCard
              icon={<FaChartLine />}
              title="Professional Features"
              description="Everything you need for game day and beyond, all in one comprehensive app."
              highlights={[
                'Interactive field',
                'Live statistics',
                'Tournament tracking'
              ]}
            />
            <FeatureCard
              icon={<FaDollarSign />}
              title="Free Version Available"
              description="Get started with the free version. Install once and start managing your team immediately."
              highlights={[
                'No credit card required',
                'Full feature access',
                'Install instantly'
              ]}
            />
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section id="features" className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need for Match Day
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Comprehensive tools designed specifically for soccer coaching
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="card">
              <FaFutbol className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Interactive Soccer Field</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag-and-drop player positioning with realistic field visualization
              </p>
            </div>
            <div className="card">
              <FaClock className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Professional Game Timer</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Substitution tracking with visual alerts and history logging
              </p>
            </div>
            <div className="card">
              <FaChartLine className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Comprehensive Statistics</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Player performance tracking with goals, assists, and playtime
              </p>
            </div>
            <div className="card">
              <FaPencilAlt className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Tactics Board</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drawing tools for play design and team instruction
              </p>
            </div>
            <div className="card">
              <FaUsers className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Multi-Team Management</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Master roster system with unlimited teams and players
              </p>
            </div>
            <div className="card">
              <FaTrophy className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Season & Tournaments</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Organize competitions and track performance over time
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/features" className="btn btn-primary">
              Explore All Features
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container-custom text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Take Control of Your Team Data?
          </h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Start using MatchOps-Local today. No signup required. Works in your browser immediately.
          </p>
          <a
            href="https://matchops.app"
            className="btn bg-white text-primary hover:bg-gray-100 text-lg px-8 py-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get Started Now
          </a>
          <p className="text-sm mt-4 opacity-75">
            No credit card required • Your data stays on your device
          </p>
        </div>
      </section>
    </Layout>
  );
}
