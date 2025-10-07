# Progressive Web App (PWA) Updates

This document details how MatchOps-Local handles PWA updates, service worker management, and user notifications for new versions.

## Overview

MatchOps-Local is a Progressive Web App that can be installed on devices and run offline. When new versions are deployed, the app uses a service worker to detect updates and prompt users to reload.

**Key Fix Implemented**: October 7, 2025 - Added periodic update checks to ensure users receive update prompts reliably (commit `d25cddf`)

## Architecture

### Service Worker Registration
**File**: `/src/components/ServiceWorkerRegistration.tsx`

The ServiceWorkerRegistration component handles:
1. Service worker registration on app mount
2. Detection of waiting service workers
3. Periodic update checks (every 60 seconds)
4. User notification via UpdateBanner
5. Controlled activation of new service workers

### Service Worker File
**File**: `/public/sw.js`

The service worker provides:
- Offline caching strategy
- Static resource caching
- Network-first with cache fallback
- Build timestamp for version tracking

### Update Banner UI
**File**: `/src/components/UpdateBanner.tsx`

User-facing notification component that:
- Displays update availability
- Shows release notes
- Provides "Reload" action button
- Allows dismissal (temporary)

## Update Detection Flow

### 1. Registration Phase
```typescript
navigator.serviceWorker.register('/sw.js').then(registration => {
  // Check if service worker is already waiting
  if (registration.waiting) {
    // Show update banner immediately
    setWaitingWorker(registration.waiting);
    setShowUpdateBanner(true);
    return;
  }

  // Listen for new service worker installations
  registration.onupdatefound = () => {
    const newWorker = registration.installing;
    newWorker.onstatechange = () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New service worker installed while old one is active
        setWaitingWorker(newWorker);
        setShowUpdateBanner(true);
      }
    };
  };
});
```

### 2. Periodic Update Checks
```typescript
// Check for updates every 60 seconds
updateInterval = setInterval(() => {
  registration.update().catch(error => {
    logger.error('[PWA] Update check failed:', error);
  });
}, 60000);
```

**Why 60 seconds?**
- Browser default: Only checks on navigation/every 24 hours
- 60-second interval ensures prompt detection (1-2 minutes typical)
- Balance between responsiveness and resource usage
- Particularly helpful for rapid deployment cycles

### 3. User Activation
```typescript
const handleUpdate = () => {
  if (waitingWorker) {
    // Tell waiting worker to skip waiting
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setShowUpdateBanner(false);
  }
};

// Service worker responds to SKIP_WAITING
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// New service worker takes control
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload(); // Reload to activate new version
});
```

## Build-Time Version Stamping

### Timestamp Injection
**File**: `/scripts/generate-manifest.mjs` (lines 58-77)

During build, the service worker file is updated with a fresh timestamp:

```javascript
async function updateServiceWorker() {
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');
  const contentWithoutTimestamp = swContent.replace(/\/\/ Build Timestamp: .*/, '').trim();
  const newContent = `${contentWithoutTimestamp}\n// Build Timestamp: ${new Date().toISOString()}`;
  fs.writeFileSync(swPath, newContent);
}
```

**Build Command**: `/package.json`
```json
{
  "scripts": {
    "build": "node scripts/generate-release-notes.mjs && node scripts/generate-manifest.mjs && next build"
  }
}
```

The timestamp ensures that every build produces a unique service worker file, triggering browser update detection.

### Release Notes
**File**: `/public/release-notes.json`

Generated at build time from the latest commit message:

```javascript
function getLastCommitMessage() {
  const full = execSync('git log -1 --format=%B').toString().trim();
  const lines = full.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  // Extract meaningful message from merge commits
  if (lines[0].startsWith('Merge pull request')) {
    return lines[lines.length - 1];
  }

  return lines[0];
}
```

Release notes are displayed in the UpdateBanner to inform users about changes.

## Browser Update Detection

### How Browsers Detect SW Changes

1. **Byte-by-byte comparison**: Browser compares new `/sw.js` with cached version
2. **If different**: Installs new service worker in "waiting" state
3. **If identical**: No update detected

**Critical**: This is why build timestamp injection is essential - without it, functionally identical service workers would never trigger updates.

### Update Check Timing

**Before Fix (Pre-October 7, 2025)**:
- ❌ On page navigation only
- ❌ Every 24 hours (browser default)
- ❌ Installed PWAs staying open = no updates

**After Fix (October 7, 2025)**:
- ✅ On page navigation
- ✅ Every 60 seconds (automatic)
- ✅ Reliable update detection for all users

## Implementation Details

### Memory Management
```typescript
useEffect(() => {
  let updateInterval: NodeJS.Timeout | null = null;

  navigator.serviceWorker.register('/sw.js').then(registration => {
    // Set up periodic checks
    updateInterval = setInterval(() => {
      registration.update();
    }, 60000);
  });

  // Cleanup on unmount
  return () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  };
}, []);
```

Proper cleanup prevents:
- Memory leaks from orphaned intervals
- Multiple concurrent update checks
- Resource exhaustion in long-lived sessions

### Error Handling
```typescript
registration.update().catch(error => {
  logger.error('[PWA] Update check failed:', error);
});
```

Failed update checks are logged but don't block:
- Next check happens in 60 seconds
- User experience unaffected
- Offline scenarios handled gracefully

## Testing

### Test Coverage
**File**: `/src/components/__tests__/ServiceWorkerRegistration.test.tsx`

Test suite covers:
1. ✅ Service worker registration on mount
2. ✅ Periodic update checks every 60 seconds
3. ✅ Update banner display when SW waiting
4. ✅ Interval cleanup on component unmount

```typescript
it('should check for updates every 60 seconds', async () => {
  render(<ServiceWorkerRegistration />);

  // Fast-forward 60 seconds
  act(() => jest.advanceTimersByTime(60000));

  await waitFor(() => {
    expect(mockRegistration.update).toHaveBeenCalledTimes(1);
  });

  // Fast-forward another 60 seconds
  act(() => jest.advanceTimersByTime(60000));

  await waitFor(() => {
    expect(mockRegistration.update).toHaveBeenCalledTimes(2);
  });
});
```

### Manual Testing Procedure

1. **Build and deploy** version A
2. **Install PWA** on device
3. **Keep PWA open** (don't navigate away)
4. **Deploy** version B with changes
5. **Wait 1-2 minutes**
6. **Verify** update banner appears
7. **Click "Reload"**
8. **Confirm** new version active

Expected timeline:
- 0:00 - Version B deployed
- 0:60 - First update check detects new SW
- 0:61 - Update banner appears
- User clicks reload
- New version activated

## Deployment Considerations

### Vercel Deployment
- Auto-deploys on git push to master
- Build process runs `generate-manifest.mjs` → injects timestamp
- Service worker uploaded with unique timestamp
- CDN invalidation triggers browser update checks

### Production Verification
After deployment, verify update detection:

```bash
# Check deployed service worker timestamp
curl -s https://your-domain.vercel.app/sw.js | tail -3

# Check release notes
curl -s https://your-domain.vercel.app/release-notes.json

# Example output:
# // Build Timestamp: 2025-10-07T10:15:30.123Z
# {"version":"0.1.0","notes":"fix: add periodic service worker update checks for PWA"}
```

### Cache Invalidation
Service worker file caching:
- Browser checks for updates automatically
- `Cache-Control` headers set by Vercel
- Timestamp changes force browser to fetch new version
- No manual cache invalidation needed

## Known Issues & Solutions

### Issue: Update Prompts Not Appearing (FIXED)
**Symptom**: Installed PWAs not showing update banner after deployments

**Root Cause**:
- Service workers only checked on navigation or every 24 hours
- Users keeping PWA open continuously missed updates
- No active polling mechanism

**Solution (October 7, 2025)**:
- Added 60-second update polling interval
- Ensures detection within 1-2 minutes
- Proper cleanup prevents memory leaks

### Issue: Development Mode Update Errors
**Symptom**: HMR errors during rapid development changes

**Solution**:
- Errors are cosmetic in development only
- Production builds unaffected
- Use `npm run build && npm start` for production testing

## Configuration

### Update Check Interval

To adjust the update check frequency, modify the interval in `ServiceWorkerRegistration.tsx`:

```typescript
// Default: 60 seconds (60000ms)
updateInterval = setInterval(() => {
  registration.update();
}, 60000);

// More aggressive: 30 seconds
updateInterval = setInterval(() => {
  registration.update();
}, 30000);

// Less aggressive: 5 minutes
updateInterval = setInterval(() => {
  registration.update();
}, 300000);
```

**Recommendations**:
- Development: 30-60 seconds (rapid feedback)
- Production: 60 seconds (balance responsiveness/resources)
- Low-priority: 5 minutes (minimize resource usage)

### Disable Update Checks

For specific use cases (offline demos, kiosk mode), disable periodic checks:

```typescript
// Comment out the setInterval call
// updateInterval = setInterval(() => { ... }, 60000);

// Users will only receive updates on:
// - Page navigation
// - Manual reload
// - Browser's default 24-hour check
```

## Future Enhancements

### Short-term
- [ ] Configurable update check interval via app settings
- [ ] Changelog display in update banner
- [ ] "Update now" vs "Update later" options with reminders

### Long-term
- [ ] Background sync for automatic updates during idle
- [ ] A/B testing infrastructure for gradual rollouts
- [ ] Version history and rollback capability
- [ ] Push notifications for critical updates

## References

- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Update Strategies](https://web.dev/service-worker-lifecycle/)
- [Workbox Update Patterns](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/)
