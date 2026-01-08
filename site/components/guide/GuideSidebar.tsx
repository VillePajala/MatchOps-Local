import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { FaTimes, FaHome } from 'react-icons/fa';
import {
  getGroupedSections,
  guideGroups,
  type GuideSection,
  type GuideGroup,
} from '@/lib/guide/guideConfig';
import GuideSearch from './GuideSearch';
import type { SearchIndexData } from '@/lib/guide/searchIndex';

interface GuideSidebarProps {
  currentSlug?: string;
  isOpen: boolean;
  onClose: () => void;
  searchData?: SearchIndexData;
}

export default function GuideSidebar({
  currentSlug,
  isOpen,
  onClose,
  searchData,
}: GuideSidebarProps) {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();

  const getTitle = (section: GuideSection) => {
    return locale === 'fi' ? section.titleFi : section.title;
  };

  const getGroupTitle = (group: GuideGroup) => {
    return t(`groups.${group}`);
  };

  const groupedSections = getGroupedSections();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 z-50
          transform transition-transform duration-300 ease-in-out overflow-y-auto
          lg:static lg:translate-x-0 lg:w-64 lg:shrink-0 lg:bg-transparent lg:border-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 lg:hidden">
          <h2 className="text-lg font-semibold text-white">
            {t('nav.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label={t('nav.closeMenu')}
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation content */}
        <nav className="p-4">
          {/* Back to home link */}
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-primary mb-6 transition-colors"
            onClick={onClose}
          >
            <FaHome className="w-4 h-4" />
            {t('nav.backToHome')}
          </Link>

          {/* Guide title (desktop) */}
          <h2 className="hidden lg:block text-lg font-semibold text-white mb-4">
            {t('nav.title')}
          </h2>

          {/* Search */}
          {searchData && (
            <div className="mb-6">
              <GuideSearch searchData={searchData} onResultClick={onClose} />
            </div>
          )}

          {/* Section links grouped */}
          <div className="space-y-6">
            {groupedSections.map(({ group, sections }) => (
              <div key={group}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
                  {getGroupTitle(group)}
                </h3>
                <ul className="space-y-1">
                  {sections.map((section) => {
                    const isActive = currentSlug === section.slug;
                    const Icon = section.icon;

                    return (
                      <li key={section.slug}>
                        <Link
                          href={`/guide/${section.slug}`}
                          onClick={onClose}
                          className={`
                            flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                            ${
                              isActive
                                ? 'bg-primary/10 text-primary border-l-2 border-primary'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }
                          `}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 ${
                              isActive ? 'text-primary' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate">{getTitle(section)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}
