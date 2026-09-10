/**
 * Copies the pdf.js worker into public/ so it is served same-origin.
 *
 * The app's CSP is `worker-src 'self' blob:`. Loading the worker from a CDN
 * would be blocked, and widening the policy for a file we already ship is the
 * wrong trade. Copying keeps the policy tight and the worker version locked to
 * the pdfjs-dist in package.json, which matters: a worker from a different
 * build than the library fails at runtime in ways that read as corrupt PDFs.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('pdfjs-dist/package.json'));
const src = join(pkg, 'build', 'pdf.worker.min.mjs');
const destDir = join(process.cwd(), 'public', 'pdfjs');
const dest = join(destDir, 'pdf.worker.min.mjs');

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log(`pdf.js worker copied to public/pdfjs/ (from pdfjs-dist ${require('pdfjs-dist/package.json').version})`);
