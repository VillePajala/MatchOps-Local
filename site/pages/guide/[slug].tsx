import { useMemo } from 'react';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps, GetStaticPaths } from 'next';
import { GuideLayout, Screenshot } from '@/components/guide';
import { getAllSlugs, getSectionBySlug } from '@/lib/guide/guideConfig';
import { buildSearchIndex } from '@/lib/guide/buildSearchIndex';
import type { SearchIndexData } from '@/lib/guide/searchIndex';

// Custom MDX components
const mdxComponents = {
  Screenshot,
  // Add callout component
  Callout: ({
    type = 'info',
    children,
  }: {
    type?: 'info' | 'warning' | 'tip';
    children: React.ReactNode;
  }) => {
    const styles = {
      info: 'bg-blue-900/30 border-blue-500/50 text-blue-200',
      warning: 'bg-amber-900/30 border-amber-500/50 text-amber-200',
      tip: 'bg-green-900/30 border-green-500/50 text-green-200',
    };
    const icons = {
      info: 'i',
      warning: '!',
      tip: '★',
    };

    return (
      <div className={`my-4 p-4 rounded-lg border-l-4 ${styles[type]}`}>
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-sm font-bold">
            {icons[type]}
          </span>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    );
  },
  // Steps component for numbered instructions
  Steps: ({ children }: { children: React.ReactNode }) => (
    <div className="my-6 space-y-4 [counter-reset:step]">{children}</div>
  ),
  Step: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="relative pl-10 pb-4 border-l-2 border-slate-700 last:border-transparent [counter-increment:step]">
      <div className="absolute left-0 -translate-x-1/2 w-8 h-8 rounded-full bg-primary text-slate-900 flex items-center justify-center font-bold text-sm before:content-[counter(step)]" />
      <h3 className="font-semibold text-white mb-2">{title}</h3>
      <div className="text-slate-300">{children}</div>
    </div>
  ),
};

interface GuidePageProps {
  slug: string;
  mdxSource: MDXRemoteSerializeResult | null;
  frontmatter: {
    title?: string;
    description?: string;
    lastUpdated?: string;
  };
  hasContent: boolean;
  searchData: SearchIndexData;
}

export default function GuidePage({
  slug,
  mdxSource,
  frontmatter,
  hasContent,
  searchData,
}: GuidePageProps) {
  const section = useMemo(() => getSectionBySlug(slug), [slug]);

  return (
    <GuideLayout slug={slug} frontmatter={frontmatter} searchData={searchData}>
      {hasContent && mdxSource ? (
        <MDXRemote {...mdxSource} components={mdxComponents} />
      ) : (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
            {section?.icon && <section.icon className="w-8 h-8 text-slate-500" />}
          </div>
          <h2 className="text-xl font-semibold text-slate-300 mb-2">
            Content Coming Soon
          </h2>
          <p className="text-slate-500 max-w-md mx-auto">
            This guide section is being written. Check back soon for detailed
            instructions and tips.
          </p>
        </div>
      )}
    </GuideLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async ({ locales }) => {
  const slugs = getAllSlugs();
  const paths: { params: { slug: string }; locale: string }[] = [];

  for (const locale of locales || ['en', 'fi']) {
    for (const slug of slugs) {
      paths.push({ params: { slug }, locale });
    }
  }

  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<GuidePageProps> = async ({
  params,
  locale,
}) => {
  const slug = params?.slug as string;
  const contentDir = path.join(process.cwd(), 'content', 'guide', locale || 'en');
  const filePath = path.join(contentDir, `${slug}.mdx`);

  let mdxSource: MDXRemoteSerializeResult | null = null;
  let frontmatter: GuidePageProps['frontmatter'] = {};
  let hasContent = false;

  // Try to load MDX content if it exists
  if (fs.existsSync(filePath)) {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContents);

    frontmatter = {
      title: data.title,
      description: data.description,
      lastUpdated: data.lastUpdated,
    };

    if (content.trim()) {
      hasContent = true;
      mdxSource = await serialize(content, {
        mdxOptions: {
          remarkPlugins: [],
          rehypePlugins: [],
        },
      });
    }
  }

  // Build search index
  const searchData = buildSearchIndex(locale || 'en');

  return {
    props: {
      slug,
      mdxSource,
      frontmatter,
      hasContent,
      searchData,
      ...(await serverSideTranslations(locale || 'en', ['common', 'guide'])),
    },
  };
};
