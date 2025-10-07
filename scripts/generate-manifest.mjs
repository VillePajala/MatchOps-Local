import fs from 'fs';
import path from 'path';

async function importManifestConfig() {
  const configPath = path.join(process.cwd(), 'src', 'config', 'manifest.config.js');
  const { manifestConfig } = await import(configPath);
  return manifestConfig;
}

function formatCacheVersion(timestamp) {
  return timestamp.replace(/[-:.TZ]/g, '').slice(0, 14);
}

function writePwaVersionFile(cacheVersion, timestamp) {
  const versionFilePath = path.join(process.cwd(), 'src', 'config', 'pwaVersion.ts');
  const fileContents = `export const PWA_CACHE_VERSION = '${cacheVersion}';\nexport const PWA_BUILD_TIMESTAMP = '${timestamp}';\n`;
  fs.writeFileSync(versionFilePath, fileContents);
  console.log('PWA version metadata written to src/config/pwaVersion.ts');
}

async function generateManifest(manifestConfig, branch, cacheVersion) {
  console.log(`Generating manifest for branch: ${branch}`);

  const config = manifestConfig[branch] || manifestConfig.default;

  const manifest = {
    name: config.appName,
    short_name: config.shortName,
    description: 'Soccer Tactics and Timer App for Coaches',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#1e293b',
    theme_color: config.themeColor,
    categories: ['sports', 'productivity'],
    lang: 'en-US',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
      {
        src: `/icons/icon-192x192.png?v=${cacheVersion}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable any',
      },
      {
        src: `/icons/icon-512x512.png?v=${cacheVersion}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable any',
      },
    ],
  };

  fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest generated successfully!');
}

function updateServiceWorker(cacheVersion, timestamp) {
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  try {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const withoutTimestamp = swContent.replace(/\/\/ Build Timestamp: .*/, '').trimEnd();
    const withVersion = withoutTimestamp.replace(
      /const CACHE_VERSION = '.*?';/,
      `const CACHE_VERSION = '${cacheVersion}';`
    );
    const newContent = `${withVersion}\n// Build Timestamp: ${timestamp}\n`;
    fs.writeFileSync(swPath, newContent);
    console.log('Service worker updated successfully!');
  } catch (error) {
    console.error('Failed to update service worker:', error);
    if (error.code !== 'ENOENT') {
      throw error;
    } else {
      console.warn('public/sw.js not found, skipping update.');
    }
  }
}

async function main() {
  const manifestConfig = await importManifestConfig();
  const branch = process.env.VERCEL_GIT_COMMIT_REF || 'development';
  const timestamp = new Date().toISOString();
  const cacheVersion = formatCacheVersion(timestamp);

  await generateManifest(manifestConfig, branch, cacheVersion);
  updateServiceWorker(cacheVersion, timestamp);
  writePwaVersionFile(cacheVersion, timestamp);
}

main().catch(error => {
  console.error('Build script failed:', error);
  process.exit(1);
});
