# Performance Baseline

Last Updated: December 7, 2025

This document establishes performance baselines for MatchOps to track improvements and catch regressions.

## Lighthouse Targets (PWA)

| Metric | Target | Notes |
|--------|--------|-------|
| Performance | > 90 | First Contentful Paint, Speed Index |
| Accessibility | > 90 | WCAG 2.1 AA compliance |
| Best Practices | > 90 | Security, modern APIs |
| SEO | > 90 | Meta tags, crawlability |
| PWA | Pass | Installable, offline-capable |

## Running Lighthouse

### Via Chrome DevTools
1. Open Chrome DevTools (F12)
2. Go to "Lighthouse" tab
3. Select "Mobile" device
4. Check all categories
5. Click "Analyze page load"

### Via CLI
```bash
# Install Lighthouse
npm install -g lighthouse

# Run audit
lighthouse https://matchops-local.vercel.app --output html --output-path ./lighthouse-report.html
```

## Bundle Size Targets

| Bundle | Target | Current |
|--------|--------|---------|
| First Load JS | < 200 KB | TBD |
| Main bundle | < 150 KB | TBD |
| Total JS (gzipped) | < 300 KB | TBD |

### Analyzing Bundle Size

```bash
# Run bundle analyzer
npm run build:analyze

# This generates visual reports in .next/analyze/
```

## Core Web Vitals Targets

| Metric | Target | Description |
|--------|--------|-------------|
| LCP | < 2.5s | Largest Contentful Paint |
| FID | < 100ms | First Input Delay |
| CLS | < 0.1 | Cumulative Layout Shift |
| TTFB | < 800ms | Time to First Byte |

## PWA Checklist

- [x] Valid manifest.json
- [x] Service worker registered
- [x] Offline page works
- [x] Icons (192x192, 512x512)
- [x] Maskable icons
- [x] HTTPS (via Vercel)
- [x] Viewport meta tag
- [x] Theme color set

## Accessibility Checklist

- [x] Color contrast (WCAG AA)
- [x] Keyboard navigation
- [x] Screen reader support (ARIA labels)
- [x] Focus indicators
- [x] Proper heading hierarchy
- [x] Form labels
- [x] Alt text on images

## Monitoring

### Pre-Release
- Run Lighthouse before each release
- Compare against baseline
- Fix any regressions

### Post-Release
- Monitor via Play Console vitals
- Check Sentry for performance issues
- User feedback on performance

## Known Optimizations Applied

1. **React.memo** on expensive components (SoccerField, PlayerBar)
2. **Code splitting** via Next.js dynamic imports
3. **Image optimization** via Next.js Image component
4. **Service Worker** caching for static assets
5. **IndexedDB** for efficient local storage

## Future Optimizations (If Needed)

- [ ] Lazy load modals
- [ ] Virtual scrolling for large player lists
- [ ] Web Workers for heavy calculations
- [ ] Preload critical resources
