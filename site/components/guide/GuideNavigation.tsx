import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import type { GuideSection } from '@/lib/guide/guideConfig';

interface GuideNavigationProps {
  prevSection: GuideSection | null;
  nextSection: GuideSection | null;
}

export default function GuideNavigation({
  prevSection,
  nextSection,
}: GuideNavigationProps) {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();

  const getPrevTitle = () => {
    if (!prevSection) return null;
    return locale === 'fi' ? prevSection.titleFi : prevSection.title;
  };

  const getNextTitle = () => {
    if (!nextSection) return null;
    return locale === 'fi' ? nextSection.titleFi : nextSection.title;
  };

  return (
    <nav
      className="mt-12 pt-8 border-t border-slate-700"
      aria-label="Guide navigation"
    >
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        {/* Previous */}
        {prevSection ? (
          <Link
            href={`/guide/${prevSection.slug}`}
            className="group flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all flex-1"
          >
            <FaArrowLeft className="text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
            <div className="text-left min-w-0">
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                {t('navigation.previous')}
              </span>
              <p className="text-white font-medium truncate group-hover:text-primary transition-colors">
                {getPrevTitle()}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {/* Next */}
        {nextSection ? (
          <Link
            href={`/guide/${nextSection.slug}`}
            className="group flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all flex-1 justify-end text-right"
          >
            <div className="min-w-0">
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                {t('navigation.next')}
              </span>
              <p className="text-white font-medium truncate group-hover:text-primary transition-colors">
                {getNextTitle()}
              </p>
            </div>
            <FaArrowRight className="text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </nav>
  );
}
