import { useState, ReactNode } from 'react';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { FaBars } from 'react-icons/fa';
import Layout from '@/components/Layout';
import GuideSidebar from './GuideSidebar';
import GuideBreadcrumbs from './GuideBreadcrumbs';
import GuideNavigation from './GuideNavigation';
import { getSectionBySlug, getAdjacentSections, type GuideSection } from '@/lib/guide/guideConfig';
import type { SearchIndexData } from '@/lib/guide/searchIndex';

interface GuideLayoutProps {
  children: ReactNode;
  slug: string;
  frontmatter?: {
    title?: string;
    description?: string;
    lastUpdated?: string;
  };
  searchData?: SearchIndexData;
}

export default function GuideLayout({
  children,
  slug,
  frontmatter,
  searchData,
}: GuideLayoutProps) {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const section = getSectionBySlug(slug);
  const { prev, next } = getAdjacentSections(slug);

  // Get localized title
  const getTitle = (s: GuideSection | null | undefined) => {
    if (!s) return '';
    return locale === 'fi' ? s.titleFi : s.title;
  };

  const pageTitle = frontmatter?.title || getTitle(section) || t('nav.title');
  const pageDescription =
    frontmatter?.description ||
    (section
      ? locale === 'fi'
        ? section.descriptionFi
        : section.description
      : '');

  return (
    <Layout>
      <Head>
        <title>{pageTitle} - {t('nav.title')} - MatchOps Local</title>
        <meta name="description" content={pageDescription} />
      </Head>

      <div className="min-h-screen bg-slate-900">
        {/* Mobile header bar */}
        <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
              aria-label={t('nav.openMenu')}
            >
              <FaBars className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-white truncate max-w-[200px]">
              {pageTitle}
            </span>
            <div className="w-9" /> {/* Spacer for balance */}
          </div>
        </div>

        <div className="container-custom">
          <div className="flex">
            {/* Sidebar */}
            <GuideSidebar
              currentSlug={slug}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              searchData={searchData}
            />

            {/* Main content */}
            <main className="flex-1 min-w-0 px-4 py-8 lg:px-0 lg:py-12 lg:pl-8">
              <article className="max-w-3xl">
                {/* Breadcrumbs (desktop only) */}
                <div className="hidden lg:block">
                  <GuideBreadcrumbs currentTitle={pageTitle} />
                </div>

                {/* Page header */}
                <header className="mb-8">
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    {pageTitle}
                  </h1>
                  {pageDescription && (
                    <p className="text-lg text-slate-400">{pageDescription}</p>
                  )}
                  {frontmatter?.lastUpdated && (
                    <p className="mt-2 text-sm text-slate-500">
                      {t('lastUpdated', { date: frontmatter.lastUpdated })}
                    </p>
                  )}
                </header>

                {/* MDX content */}
                <div className="prose prose-invert prose-slate max-w-none">
                  {children}
                </div>

                {/* Prev/Next navigation */}
                <GuideNavigation prevSection={prev} nextSection={next} />
              </article>
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
}
