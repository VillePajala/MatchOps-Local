import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import Link from 'next/link';
import { FaFutbol, FaClock, FaChartLine, FaPencilAlt, FaUsers, FaTrophy, FaDatabase, FaShieldAlt, FaBolt, FaDownload, FaGlobe, FaMobileAlt } from 'react-icons/fa';

export default function Features() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-16">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Everything You Need for Match Day and Beyond
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Comprehensive soccer coaching tools designed specifically for your needs
          </p>
        </div>
      </section>

      {/* Game Day Management */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Game Day Management
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Professional tools for live match management
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaFutbol />}
              title="Interactive Soccer Field"
              description="Drag-and-drop player positioning with realistic field visualization. Place players, track formations, and manage your lineup in real-time."
              highlights={[
                'Realistic field rendering',
                'Drag-and-drop positioning',
                'Formation management',
                'Player status indicators',
                'One-click placement tools'
              ]}
            />
            <FeatureCard
              icon={<FaClock />}
              title="Professional Game Timer"
              description="Advanced timer with substitution interval tracking and visual alerts. Never miss a substitution window again."
              highlights={[
                'Configurable intervals (1-20 min)',
                'Time-since-last-sub tracking',
                'Visual alerts at 1 minute warning',
                'Substitution history log',
                'Large overlay for sideline visibility'
              ]}
            />
            <FeatureCard
              icon={<FaChartLine />}
              title="Real-Time Event Logging"
              description="Track every important moment as it happens. Goals, assists, opponent scores—all timestamped and recorded."
              highlights={[
                'Goal tracking with scorers',
                'Assist attribution',
                'Opponent goal logging',
                'Inline opponent name editing',
                'Event timestamps synced with timer'
              ]}
            />
            <FeatureCard
              icon={<FaPencilAlt />}
              title="Tactics Board"
              description="Dedicated drawing interface for play design and team instruction. Draw plays, set formations, and communicate strategy."
              highlights={[
                'Drawing tools for plays',
                'Add/remove opponent players',
                'Disc placement for markers',
                'Undo/Redo support',
                'Toggle tactics view on/off'
              ]}
            />
          </div>
        </div>
      </section>

      {/* Statistics & Analytics */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Statistics & Analytics
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Track performance and identify trends
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaChartLine />}
              title="Comprehensive Player Stats"
              description="Track everything that matters: goals, assists, appearances, playtime, and performance trends over time."
              highlights={[
                'Goals and assists tracking',
                'Total appearances',
                'Playtime monitoring',
                'Performance trends',
                'Tournament-specific stats'
              ]}
            />
            <FeatureCard
              icon={<FaTrophy />}
              title="Advanced Filtering"
              description="Analyze performance by season, tournament, team, or time period. Get exactly the insights you need."
              highlights={[
                'Filter by season',
                'Filter by tournament',
                'Filter by team',
                'Club season filtering (Oct-May)',
                'Player-specific game history'
              ]}
            />
          </div>
        </div>
      </section>

      {/* Team Management */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Team Management
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Organize teams, players, and competitions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaUsers />}
              title="Master Roster System"
              description="Central player database shared across all teams. Add, edit, and manage players with ease."
              highlights={[
                'Add/edit/remove players',
                'Jersey number management',
                'Goalie designation',
                'Player nicknames',
                'View player stats from roster'
              ]}
            />
            <FeatureCard
              icon={<FaTrophy />}
              title="Season & Tournament Organization"
              description="Create seasons with date ranges and track tournament performance with awards and winners."
              highlights={[
                'Season creation (date ranges)',
                'Tournament management',
                'Winner tracking',
                'Player awards',
                'Performance by competition'
              ]}
            />
          </div>
        </div>
      </section>

      {/* Data & Privacy */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Data & Privacy
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Your data, your control
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FaDatabase />}
              title="Complete Backup"
              description="Export all your data anytime. Full backup and restore functionality ensures you never lose anything."
            />
            <FeatureCard
              icon={<FaDownload />}
              title="JSON Export/Import"
              description="Standard JSON format for maximum compatibility and data portability."
            />
            <FeatureCard
              icon={<FaShieldAlt />}
              title="IndexedDB Storage"
              description="Robust browser storage with 50MB+ capacity. All data stays on your device."
            />
            <FeatureCard
              icon={<FaBolt />}
              title="Zero Transmission"
              description="No external data transmission. What stays on your device, stays on your device."
            />
          </div>
        </div>
      </section>

      {/* Technical Features */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Technical Features
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Modern web technology for maximum reliability
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<FaMobileAlt />}
              title="Progressive Web App"
              description="Install on any device. Works like a native app with the convenience of the web."
            />
            <FeatureCard
              icon={<FaBolt />}
              title="Offline-First"
              description="Full functionality without internet. Perfect for remote fields with poor connectivity."
            />
            <FeatureCard
              icon={<FaGlobe />}
              title="Multi-Language"
              description="English and Finnish language support with more languages coming soon."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container-custom text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Experience the Difference?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Try MatchOps-Local now. No signup required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://matchops.app"
              className="btn bg-white text-primary hover:bg-gray-100 text-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Started Now
            </a>
            <Link
              href="/download"
              className="btn border-2 border-white text-white hover:bg-white hover:text-primary text-lg"
            >
              Installation Guide
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
