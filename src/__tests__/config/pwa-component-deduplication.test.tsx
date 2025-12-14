/**
 * Tests for PWA component deduplication
 * Ensures ServiceWorkerRegistration, InstallPrompt, and I18nInitializer are only rendered once
 */

describe('PWA Component Deduplication', () => {
  describe('Layout and ClientWrapper Structure', () => {
    it('should have PWA components only in layout.tsx, not in ClientWrapper', async () => {
      const fs = await import('fs');
      const path = await import('path');

      // Read layout.tsx
      const layoutFile = fs.readFileSync(
        path.join(process.cwd(), 'src/app/layout.tsx'),
        'utf8'
      );

      // Read ClientWrapper.tsx
      const clientWrapperFile = fs.readFileSync(
        path.join(process.cwd(), 'src/components/ClientWrapper.tsx'),
        'utf8'
      );

      // Layout should contain PWA components
      expect(layoutFile).toContain('ServiceWorkerRegistration');
      expect(layoutFile).toContain('InstallPrompt');
      expect(layoutFile).toContain('I18nInitializer');

      // ClientWrapper should NOT contain PWA components (to avoid duplication)
      expect(clientWrapperFile).not.toContain('ServiceWorkerRegistration');
      expect(clientWrapperFile).not.toContain('InstallPrompt');
      expect(clientWrapperFile).not.toContain('I18nInitializer');
    });

    it('should have proper component hierarchy without duplication', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const layoutFile = fs.readFileSync(
        path.join(process.cwd(), 'src/app/layout.tsx'),
        'utf8'
      );

      // Verify proper structure: I18nInitializer wraps SW and InstallPrompt
      expect(layoutFile).toContain('<I18nInitializer>');
      expect(layoutFile).toContain('<ServiceWorkerRegistration />');
      expect(layoutFile).toContain('<InstallPrompt />');
      expect(layoutFile).toContain('<QueryProvider>');
      expect(layoutFile).toContain('<ClientWrapper>');
    });

    it('should have ClientWrapper only containing ToastProvider', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const clientWrapperFile = fs.readFileSync(
        path.join(process.cwd(), 'src/components/ClientWrapper.tsx'),
        'utf8'
      );

      // ClientWrapper should only have ToastProvider and children
      expect(clientWrapperFile).toContain('ToastProvider');
      expect(clientWrapperFile).toContain('{children}');

      // Should not have nested wrapping components
      expect(clientWrapperFile).not.toContain('QueryProvider');
      expect(clientWrapperFile).not.toContain('Analytics');
    });
  });

  describe('Component Import Validation', () => {
    it('should only import PWA components where they are used', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const clientWrapperFile = fs.readFileSync(
        path.join(process.cwd(), 'src/components/ClientWrapper.tsx'),
        'utf8'
      );

      // ClientWrapper should not import PWA components
      expect(clientWrapperFile).not.toContain("import I18nInitializer");
      expect(clientWrapperFile).not.toContain("import ServiceWorkerRegistration");
      expect(clientWrapperFile).not.toContain("import InstallPrompt");

      // Should only import what it uses
      expect(clientWrapperFile).toContain("import { ToastProvider }");
    });
  });
});