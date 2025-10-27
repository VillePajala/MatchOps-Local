import FeatureCard from '@/components/FeatureCard';
import Link from 'next/link';
import { FaFutbol, FaClock, FaChartLine, FaPencilAlt, FaUsers, FaTrophy, FaDatabase, FaShieldAlt, FaBolt, FaDownload, FaGlobe, FaMobileAlt } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';

export default function FeaturesSections() {
  const { t } = useTranslation('common');
  return (
    <>
      {/* Quick Nav */}
      <section className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
        <div className="container-custom py-4 overflow-x-auto">
          <nav className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
            <a href="#team" className="hover:text-primary">{t('features.teamManagement.title')}</a>
            <a href="#gameday" className="hover:text-primary">{t('features.gameDay.title')}</a>
            <a href="#statistics" className="hover:text-primary">{t('features.statistics.title')}</a>
            <a href="#privacy" className="hover:text-primary">{t('features.dataPrivacy.title')}</a>
            <a href="#technical" className="hover:text-primary">{t('features.technicalFeatures.title')}</a>
          </nav>
        </div>
      </section>

      {/* Team Management (Planning first) */}
      <section id="team" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.teamManagement.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.teamManagement.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaUsers />}
              title={t('features.teamManagement.rosterTitle')}
              description={t('features.teamManagement.rosterDesc')}
              highlights={[
                t('features.teamManagement.rosterHighlight1'),
                t('features.teamManagement.rosterHighlight2'),
                t('features.teamManagement.rosterHighlight3'),
                t('features.teamManagement.rosterHighlight4'),
                t('features.teamManagement.rosterHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaTrophy />}
              title={t('features.teamManagement.seasonTitle')}
              description={t('features.teamManagement.seasonDesc')}
              highlights={[
                t('features.teamManagement.seasonHighlight1'),
                t('features.teamManagement.seasonHighlight2'),
                t('features.teamManagement.seasonHighlight3'),
                t('features.teamManagement.seasonHighlight4'),
                t('features.teamManagement.seasonHighlight5')
              ]}
            />
          </div>
        </div>
      </section>

      {/* Game Day Management */}
      <section id="gameday" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.gameDay.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.gameDay.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaFutbol />}
              title={t('features.gameDay.interactiveFieldTitle')}
              description={t('features.gameDay.interactiveFieldDesc')}
              highlights={[
                t('features.gameDay.interactiveFieldHighlight1'),
                t('features.gameDay.interactiveFieldHighlight2'),
                t('features.gameDay.interactiveFieldHighlight3'),
                t('features.gameDay.interactiveFieldHighlight4'),
                t('features.gameDay.interactiveFieldHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaClock />}
              title={t('features.gameDay.timerTitle')}
              description={t('features.gameDay.timerDesc')}
              highlights={[
                t('features.gameDay.timerHighlight1'),
                t('features.gameDay.timerHighlight2'),
                t('features.gameDay.timerHighlight3'),
                t('features.gameDay.timerHighlight4'),
                t('features.gameDay.timerHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaChartLine />}
              title={t('features.gameDay.eventLoggingTitle')}
              description={t('features.gameDay.eventLoggingDesc')}
              highlights={[
                t('features.gameDay.eventLoggingHighlight1'),
                t('features.gameDay.eventLoggingHighlight2'),
                t('features.gameDay.eventLoggingHighlight3'),
                t('features.gameDay.eventLoggingHighlight4'),
                t('features.gameDay.eventLoggingHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaPencilAlt />}
              title={t('features.gameDay.tacticsTitle')}
              description={t('features.gameDay.tacticsDesc')}
              highlights={[
                t('features.gameDay.tacticsHighlight1'),
                t('features.gameDay.tacticsHighlight2'),
                t('features.gameDay.tacticsHighlight3'),
                t('features.gameDay.tacticsHighlight4'),
                t('features.gameDay.tacticsHighlight5')
              ]}
            />
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section id="statistics" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.statistics.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.statistics.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaChartLine />}
              title={t('features.statistics.playerStatsTitle')}
              description={t('features.statistics.playerStatsDesc')}
              highlights={[
                t('features.statistics.playerStatsHighlight1'),
                t('features.statistics.playerStatsHighlight2'),
                t('features.statistics.playerStatsHighlight3'),
                t('features.statistics.playerStatsHighlight4'),
                t('features.statistics.playerStatsHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaTrophy />}
              title={t('features.statistics.filteringTitle')}
              description={t('features.statistics.filteringDesc')}
              highlights={[
                t('features.statistics.filteringHighlight1'),
                t('features.statistics.filteringHighlight2'),
                t('features.statistics.filteringHighlight3'),
                t('features.statistics.filteringHighlight4'),
                t('features.statistics.filteringHighlight5')
              ]}
            />
            {/* Screenshot removed for a simpler, copy-first section */}
          </div>
        </div>
      </section>

      {/* Team Management */}
      <section id="team" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.teamManagement.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.teamManagement.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<FaUsers />}
              title={t('features.teamManagement.rosterTitle')}
              description={t('features.teamManagement.rosterDesc')}
              highlights={[
                t('features.teamManagement.rosterHighlight1'),
                t('features.teamManagement.rosterHighlight2'),
                t('features.teamManagement.rosterHighlight3'),
                t('features.teamManagement.rosterHighlight4'),
                t('features.teamManagement.rosterHighlight5')
              ]}
            />
            <FeatureCard
              icon={<FaTrophy />}
              title={t('features.teamManagement.seasonTitle')}
              description={t('features.teamManagement.seasonDesc')}
              highlights={[
                t('features.teamManagement.seasonHighlight1'),
                t('features.teamManagement.seasonHighlight2'),
                t('features.teamManagement.seasonHighlight3'),
                t('features.teamManagement.seasonHighlight4'),
                t('features.teamManagement.seasonHighlight5')
              ]}
            />
          </div>
        </div>
      </section>

      {/* Data & Privacy */}
      <section id="privacy" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.dataPrivacy.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.dataPrivacy.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard icon={<FaDatabase />} title={t('features.dataPrivacy.backupTitle')} description={t('features.dataPrivacy.backupDesc')} />
            <FeatureCard icon={<FaDownload />} title={t('features.dataPrivacy.exportTitle')} description={t('features.dataPrivacy.exportDesc')} />
            <FeatureCard icon={<FaShieldAlt />} title={t('features.dataPrivacy.storageTitle')} description={t('features.dataPrivacy.storageDesc')} />
            <FeatureCard icon={<FaBolt />} title={t('features.dataPrivacy.transmissionTitle')} description={t('features.dataPrivacy.transmissionDesc')} />
          </div>
        </div>
      </section>

      {/* Technical Features */}
      <section id="technical" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('features.technicalFeatures.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('features.technicalFeatures.subtitle')}
            </p>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={<FaMobileAlt />} title={t('features.technicalFeatures.pwaTitle')} description={t('features.technicalFeatures.pwaDesc')} />
            <FeatureCard icon={<FaBolt />} title={t('features.technicalFeatures.offlineTitle')} description={t('features.technicalFeatures.offlineDesc')} />
            <FeatureCard icon={<FaGlobe />} title={t('features.technicalFeatures.multiLanguageTitle')} description={t('features.technicalFeatures.multiLanguageDesc')} />
          </div>
        </div>
      </section>

      {/* CTA removed */}
    </>
  );
}
