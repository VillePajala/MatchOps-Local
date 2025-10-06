# Known Issues

## Development Mode Issues

### Hard Reset Shows Harmless Module Error (Dev Only)

**Symptom:**
When using the "Hard Reset" feature in development mode (`npm run dev`), you may see a webpack module error after the page reloads:
```
TypeError: Cannot read properties of undefined (reading 'call')
at layout-router.js / image-external.js
```

**Impact:**
- ✅ **Functionality works correctly** - all data is cleared
- ✅ **App reloads successfully** - starts fresh
- ❌ **Cosmetic error appears** - harmless but looks concerning

**Why This Happens:**
Next.js development mode uses Hot Module Replacement (HMR) to update code without full page reloads. When the app triggers a hard reset:

1. React components are still mounted
2. `window.location.reload()` is called
3. Next.js HMR tries to preserve state
4. Webpack module references become stale during reload
5. Error appears when HMR tries to access invalidated modules

**Why It's Safe to Ignore:**
- The error occurs AFTER storage is already cleared
- The page successfully reloads with clean data
- It's purely a timing issue with webpack's module system
- Production builds (`npm run build && npm start`) don't have HMR and never show this error

**Resolution:**
This is a limitation of Next.js development mode that cannot be fully eliminated without disabling HMR entirely. The code includes:
- Early return pattern to minimize component rendering during reset
- Full-screen overlay to hide UI complexity during transition
- These reduce but don't eliminate the race condition

**Workaround for Development:**
If the error message bothers you during development:
1. Simply refresh the page manually (F5) - the reset was successful
2. Or use the browser console method:
   ```javascript
   const { clearStorage } = await import('/src/utils/storage.js');
   await clearStorage();
   // Then press F5
   ```

**For Production:**
This issue does NOT occur in production builds. Users will never see this error.

---

## Other Known Issues

(None currently)
