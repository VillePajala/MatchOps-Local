import fs from 'fs';
import path from 'path';

// This is a workaround to import from a TypeScript file in a Node script.
// We are assuming the compiled output will be in a 'dist' or similar folder,
// but for this script, we'll point directly to the source TS file
// and rely on Node's module handling capabilities.
async function importManifestConfig() {
  const configPath = path.join(process.cwd(), 'src', 'config', 'manifest.config.js');
  // Use a dynamic import() which can handle modules
  const { manifestConfig } = await import(configPath);
  return manifestConfig;
}

async function generateManifest() {
  const manifestConfig = await importManifestConfig();
  const branch = process.env.VERCEL_GIT_COMMIT_REF || 'development'; // Vercel's env var, fallback for local

  console.log(`Generating manifest for branch: ${branch}`);

  // Determine which configuration to use
  const config = manifestConfig[branch] || manifestConfig.default;

  const manifest = {
    "name": config.appName,
    "short_name": config.shortName,
    "description": "Soccer Tactics and Timer App for Coaches. Track games, manage lineups, and analyze player performance.",
    "start_url": "/",
    "scope": "/",
    "id": "/",
    "display": config.displayMode || "standalone",
    "orientation": "portrait-primary",
    "background_color": "#1e293b",
    "theme_color": config.themeColor,
    "categories": ["sports", "productivity", "utilities"],
    "lang": "en-US",
    "dir": "ltr",
    "prefer_related_applications": false,
    "icons": [
      {
        "src": "/icons/favicon-32x32.png",
        "sizes": "32x32",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/icons/icon-192x192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/icons/icon-192x192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "maskable"
      },
      {
        "src": "/icons/icon-512x512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/icons/icon-512x512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable"
      }
    ],
    "screenshots": [],
    "shortcuts": [
      {
        "name": "New Game",
        "short_name": "New Game",
        "description": "Start a new game",
        "url": "/?action=new-game",
        "icons": [{ "src": "/icons/icon-192x192.png", "sizes": "192x192" }]
      }
    ]
  };

  fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest generated successfully!');
}

async function updateServiceWorker() {
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  try {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const buildTimestamp = new Date().toISOString();
    const cacheVersion = buildTimestamp.replace(/[:.]/g, '-').substring(0, 19); // e.g., "2025-10-07T12-38-47"

    // Update CACHE_NAME with build-specific version
    // Match both old format (matchops-v3) and new format (matchops-2025-10-07T12-38-47)
    let newContent = swContent.replace(
      /const CACHE_NAME = ['"]matchops-[^'"]+['"];/,
      `const CACHE_NAME = 'matchops-${cacheVersion}';`
    );

    // Remove old timestamp if it exists to prevent the file from growing indefinitely
    newContent = newContent.replace(/\/\/ Build Timestamp: .*/, '').trim();
    newContent = `${newContent}\n// Build Timestamp: ${buildTimestamp}`;

    fs.writeFileSync(swPath, newContent);
    console.log('Service worker updated successfully!');
    console.log(`  - Cache version: matchops-${cacheVersion}`);
    console.log(`  - Build timestamp: ${buildTimestamp}`);
  } catch (error) {
    console.error('Failed to update service worker:', error);
    // We don't want to fail the build if the SW doesn't exist,
    // as it might not be present in all development environments.
    if (error.code !== 'ENOENT') {
      throw error; // Rethrow if it's not a "file not found" error
    } else {
      console.warn('public/sw.js not found, skipping update.');
    }
  }
}

async function main() {
  await generateManifest();
  await updateServiceWorker();
}

main().catch(error => {
  console.error("Build script failed:", error);
  process.exit(1);
}); 