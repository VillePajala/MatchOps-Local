import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { FaChevronRight } from 'react-icons/fa';

interface GuideBreadcrumbsProps {
  currentTitle: string;
}

export default function GuideBreadcrumbs({ currentTitle }: GuideBreadcrumbsProps) {
  const { t } = useTranslation('guide');

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center text-sm text-slate-400 flex-wrap gap-y-1">
        <li>
          <Link
            href="/"
            className="hover:text-primary transition-colors"
          >
            {t('breadcrumbs.home')}
          </Link>
        </li>
        <li className="mx-2">
          <FaChevronRight className="w-3 h-3" />
        </li>
        <li>
          <Link
            href="/guide"
            className="hover:text-primary transition-colors"
          >
            {t('breadcrumbs.guide')}
          </Link>
        </li>
        <li className="mx-2">
          <FaChevronRight className="w-3 h-3" />
        </li>
        <li className="text-white font-medium truncate max-w-[200px] sm:max-w-none">
          {currentTitle}
        </li>
      </ol>
    </nav>
  );
}
