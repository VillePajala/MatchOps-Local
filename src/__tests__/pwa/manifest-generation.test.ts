/**
 * Tests for PWA manifest generation script
 * @critical - Manifest configuration affects PWA installability and Play Store
 */

describe('Manifest Generation', () => {
  const fs = require('fs');
  const path = require('path');

  interface ManifestIcon {
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }

  interface Manifest {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    orientation: string;
    theme_color: string;
    background_color: string;
    categories: string[];
    lang: string;
    dir: string;
    prefer_related_applications: boolean;
    icons: ManifestIcon[];
  }

  let scriptContent: string;
  let staticManifest: Manifest;

  beforeAll(() => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-manifest.mjs');
    scriptContent = fs.readFileSync(scriptPath, 'utf8');

    const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
    staticManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  });

  describe('Manifest Script', () => {
    it('should read config from manifest.config.js', () => {
      expect(scriptContent).toContain('manifest.config.js');
    });

    it('should support branch-based configuration', () => {
      expect(scriptContent).toContain('VERCEL_GIT_COMMIT_REF');
    });

    it('should have fallback for development', () => {
      expect(scriptContent).toContain("|| 'development'");
    });

    it('should generate required PWA fields', () => {
      expect(scriptContent).toContain('"name":');
      expect(scriptContent).toContain('"short_name":');
      expect(scriptContent).toContain('"start_url":');
      expect(scriptContent).toContain('"display":');
      expect(scriptContent).toContain('"theme_color":');
      expect(scriptContent).toContain('"background_color":');
    });

    it('should have manifest id for PWA identity', () => {
      expect(scriptContent).toContain('"id":');
    });
  });

  describe('Icon Configuration', () => {
    it('should include 192x192 icon', () => {
      const icon192 = staticManifest.icons.find(
        (i) => i.sizes === '192x192'
      );
      expect(icon192).toBeDefined();
    });

    it('should include 512x512 icon', () => {
      const icon512 = staticManifest.icons.find(
        (i) => i.sizes === '512x512'
      );
      expect(icon512).toBeDefined();
    });

    it('should have maskable icon variants for Android', () => {
      const maskableIcons = staticManifest.icons.filter(
        (i) => i.purpose === 'maskable'
      );
      expect(maskableIcons.length).toBeGreaterThan(0);
    });

    it('should have any purpose icons', () => {
      const anyIcons = staticManifest.icons.filter(
        (i) => i.purpose === 'any'
      );
      expect(anyIcons.length).toBeGreaterThan(0);
    });

    it('script should include maskable icons', () => {
      expect(scriptContent).toContain('"purpose": "maskable"');
    });
  });

  describe('Static Manifest Validation', () => {
    it('should have valid start_url', () => {
      expect(staticManifest.start_url).toBe('/');
    });

    it('should have valid scope', () => {
      expect(staticManifest.scope).toBe('/');
    });

    it('should have standalone display mode', () => {
      expect(staticManifest.display).toBe('standalone');
    });

    it('should have portrait orientation', () => {
      expect(staticManifest.orientation).toBe('portrait-primary');
    });

    it('should have proper categories', () => {
      expect(staticManifest.categories).toContain('sports');
      expect(staticManifest.categories).toContain('productivity');
    });

    it('should not prefer related applications', () => {
      expect(staticManifest.prefer_related_applications).toBe(false);
    });

    it('should have language set', () => {
      expect(staticManifest.lang).toBeDefined();
    });

    it('should have direction set', () => {
      expect(staticManifest.dir).toBe('ltr');
    });
  });

  describe('Asset Links Validation', () => {
    it('should validate assetlinks.json during build', () => {
      expect(scriptContent).toContain('validateAssetLinks');
    });

    it('should block production builds with placeholder fingerprint', () => {
      expect(scriptContent).toContain('PRODUCTION BUILD BLOCKED');
      expect(scriptContent).toContain('placeholder fingerprint');
    });

    it('should warn in development about placeholder', () => {
      expect(scriptContent).toContain('WARNING: assetlinks.json contains placeholder');
    });

    it('should check for REPLACE placeholder', () => {
      expect(scriptContent).toContain("fingerprint.includes('REPLACE')");
    });

    it('should validate fingerprint format with regex', () => {
      expect(scriptContent).toContain('fingerprintRegex');
      expect(scriptContent).toContain('[A-F0-9]{2}');
    });

    it('should block production builds with invalid fingerprint format', () => {
      expect(scriptContent).toContain('Invalid fingerprint format');
    });
  });

  describe('Service Worker Update', () => {
    it('should update service worker cache version', () => {
      expect(scriptContent).toContain('updateServiceWorker');
      expect(scriptContent).toContain('CACHE_NAME');
    });

    it('should add build timestamp', () => {
      expect(scriptContent).toContain('Build Timestamp');
    });
  });
});
