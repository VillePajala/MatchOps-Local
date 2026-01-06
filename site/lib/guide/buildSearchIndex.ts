// Server-side only - uses Node.js fs module
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { guideSections } from './guideConfig';
import type { SearchIndexData, SearchResult } from './searchIndex';

/**
 * Strip MDX/Markdown to plain text for indexing
 */
function stripMdxToText(mdx: string): string {
  return mdx
    // Remove MDX component tags
    .replace(/<[^>]+>/g, ' ')
    // Remove markdown links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown formatting
    .replace(/[*_~`#]+/g, '')
    // Remove frontmatter (already parsed)
    .replace(/^---[\s\S]*?---/m, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build search index data from MDX content files
 * Called at build time in getStaticProps
 */
export function buildSearchIndex(locale: string): SearchIndexData {
  const contentDir = path.join(process.cwd(), 'content', 'guide', locale);
  const documents: SearchResult[] = [];

  for (const section of guideSections) {
    const filePath = path.join(contentDir, `${section.slug}.mdx`);
    let content = '';
    let title = locale === 'fi' ? section.titleFi : section.title;
    let description = locale === 'fi' ? section.descriptionFi : section.description;

    // Try to read MDX file if it exists
    if (fs.existsSync(filePath)) {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const { data, content: mdxContent } = matter(fileContents);

        // Use frontmatter title/description if available
        if (data.title) title = data.title;
        if (data.description) description = data.description;

        // Strip MDX components and get plain text content
        content = stripMdxToText(mdxContent);
      } catch {
        // File read error, use defaults
      }
    }

    documents.push({
      slug: section.slug,
      title,
      description,
      content,
    });
  }

  return { documents };
}
