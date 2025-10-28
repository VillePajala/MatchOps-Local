import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import createMDX from '@next/mdx';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

const require = createRequire(import.meta.url);
const { i18n } = require('./next-i18next.config.js');

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: true,
  output: 'standalone',
  i18n,
  // Silence workspace root warning by pointing tracing to repo root
  outputFileTracingRoot: path.join(__dirname, '..'),
  async redirects() {
    return [
      {
        source: '/fi/docs/:path*',
        destination: '/docs/:path*',
        permanent: false,
        locale: false,
      },
    ];
  },
};

export default withMDX(nextConfig);
