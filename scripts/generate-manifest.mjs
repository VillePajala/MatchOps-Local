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
    "screenshots": [
      {
        "src": "/screenshots/game-view.png",
        "sizes": "1696x2528",
        "type": "image/png",
        "form_factor": "narrow",
        "label": "Game tracking view with player positions"
      },
      {
        "src": "/screenshots/detail-view.png",
        "sizes": "1024x1536",
        "type": "image/png",
        "form_factor": "narrow",
        "label": "Detailed game analysis"
      },
      {
        "src": "/screenshots/stats-view.png",
        "sizes": "1024x1536",
        "type": "image/png",
        "form_factor": "narrow",
        "label": "Player statistics dashboard"
      }
    ],
    "shortcuts": [
      {
        "name": "New Game",
        "short_name": "New",
        "description": "Start a new game",
        "url": "/?action=newGame",
        "icons": [{ "src": "/icons/icon-192x192.png", "sizes": "192x192" }]
      },
      {
        "name": "Player Stats",
        "short_name": "Stats",
        "description": "View player statistics",
        "url": "/?action=stats",
        "icons": [{ "src": "/icons/icon-192x192.png", "sizes": "192x192" }]
      },
      {
        "name": "Manage Roster",
        "short_name": "Roster",
        "description": "Manage your player roster",
        "url": "/?action=roster",
        "icons": [{ "src": "/icons/icon-192x192.png", "sizes": "192x192" }]
      }
    ]
  };

  fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));

  // Verify the generated manifest is valid JSON
  try {
    const written = fs.readFileSync('public/manifest.json', 'utf8');
    JSON.parse(written);
    console.log('Manifest generated successfully!');
    console.log('  ✓ Manifest is valid JSON');
  } catch (parseError) {
    throw new Error(`Generated manifest is not valid JSON: ${parseError.message}`);
  }
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

    // Verify the service worker has valid JavaScript syntax
    try {
      // Use Function constructor to check syntax (doesn't execute the code)
      new Function(newContent);
      console.log('Service worker updated successfully!');
      console.log(`  - Cache version: matchops-${cacheVersion}`);
      console.log(`  - Build timestamp: ${buildTimestamp}`);
      console.log('  ✓ Service worker has valid JavaScript syntax');
    } catch (syntaxError) {
      throw new Error(`Generated service worker has invalid syntax: ${syntaxError.message}`);
    }
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

async function validateAssetLinks() {
  const assetLinksPath = path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
  const branch = process.env.VERCEL_GIT_COMMIT_REF || 'development';
  const isProduction = branch === 'master' || branch === 'main';

  try {
    const assetLinks = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
    const fingerprint = assetLinks[0]?.target?.sha256_cert_fingerprints?.[0] || '';

    // SHA256 fingerprint format: 32 pairs of hex digits separated by colons
    // Example: AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90
    // Note: Accept both uppercase and lowercase hex (some tools like keytool output uppercase, others lowercase)
    const fingerprintRegex = /^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;

    // Check for placeholder values (both old and new format)
    if (fingerprint.includes('REPLACE') || fingerprint.includes('PLACEHOLDER')) {
      if (isProduction) {
        throw new Error(
          'PRODUCTION BUILD BLOCKED: assetlinks.json contains placeholder fingerprint!\n' +
          'Update public/.well-known/assetlinks.json with your actual signing key SHA256 fingerprint.\n' +
          'See docs/05-development/twa-build-guide.md for instructions.'
        );
      } else {
        console.warn('⚠️  WARNING: assetlinks.json contains placeholder fingerprint.');
        console.warn('   TWA verification will fail until you add your signing key fingerprint.');
        console.warn('   This is OK for development but must be fixed before Play Store release.');
      }
    } else if (!fingerprintRegex.test(fingerprint)) {
      console.warn('⚠️  WARNING: Invalid SHA256 fingerprint format in assetlinks.json');
      console.warn('   Expected format: XX:XX:XX:... (32 pairs of hex digits separated by colons)');
      console.warn(`   Got: ${fingerprint}`);
      if (isProduction) {
        throw new Error('PRODUCTION BUILD BLOCKED: Invalid fingerprint format in assetlinks.json');
      }
    } else {
      console.log('Asset links validated successfully!');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('public/.well-known/assetlinks.json not found, skipping validation.');
    } else {
      throw error;
    }
  }
}

async function main() {
  await generateManifest();
  await updateServiceWorker();
  await validateAssetLinks();
}

main().catch(error => {
  console.error("Build script failed:", error);
  process.exit(1);
}); 