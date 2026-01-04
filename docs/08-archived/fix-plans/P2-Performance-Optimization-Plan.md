# P2: Performance Optimization Plan (MEDIUM)

**Priority**: P2 - MEDIUM
**Primary File**: `/src/components/HomePage.tsx`
**Issue**: Large component causes unnecessary re-renders
**Estimated Effort**: 30 minutes
**Impact**: MEDIUM - Improves app responsiveness, reduces battery drain
**Status**: ❌ Not Started
**Dependency**: Most issues automatically fixed by P0 (HomePage refactoring)

---

## 🎯 OBJECTIVE

Optimize React re-renders after HomePage refactoring to ensure <50ms render times across all components.

---

## 📊 PROBLEM STATEMENT

### Current Performance Issues

1. **Massive Re-renders**: HomePage's 3,725 lines re-evaluate on any state change
2. **Prop Drilling**: Changes propagate through many levels
3. **Unnecessary Re-renders**: Child components re-render when parent state changes unrelated to them

**Evidence:**
```typescript
// Any modal state change triggers:
setIsGameStatsModalOpen(true);
  → HomePage re-renders (3,725 lines evaluated)
  → All child components re-render
  → 150ms+ render time on slower devices
```

---

## 🏗️ SOLUTION STRATEGY

### Automatic Fixes (from P0 Refactoring)

Most performance issues will be **automatically resolved** when HomePage is refactored:

- ✅ Smaller components = faster evaluation
- ✅ Isolated state = limited re-render scope
- ✅ Modal state separate = no HomePage re-render on modal open/close

### Additional Optimizations

After P0 is complete, apply these targeted optimizations:

---

## 📝 OPTIMIZATION CHECKLIST

### 1. Add React.memo to Stable Components (10 min)

**Components that rarely change:**

```typescript
// src/components/SoccerField.tsx
export default React.memo(SoccerField, (prevProps, nextProps) => {
  // Custom comparison - only re-render if players/drawings change
  return (
    prevProps.players === nextProps.players &&
    prevProps.drawings === nextProps.drawings &&
    prevProps.showPlayerNames === nextProps.showPlayerNames
  );
});
```

**Candidates for React.memo:**
- `SoccerField` - Only re-render when field state changes
- `PlayerBar` - Only re-render when roster changes
- `GameInfoBar` - Only re-render when score/teams change
- `ControlBar` - Only re-render when timer changes

### 2. Memoize Expensive Calculations (10 min)

```typescript
// BEFORE - Recalculates every render
function GameStatsModal({ games }) {
  const playerStats = calculatePlayerStats(games); // Expensive!
  // ...
}

// AFTER - Only recalculates when games change
function GameStatsModal({ games }) {
  const playerStats = useMemo(
    () => calculatePlayerStats(games),
    [games]
  );
  // ...
}
```

**Candidates for useMemo:**
- Player statistics calculations
- Sorted game lists
- Filtered roster lists
- Aggregate stats

### 3. Memoize Event Handlers (10 min)

```typescript
// BEFORE - New function every render
function Component() {
  const handleClick = () => { /* ... */ }; // New function!
  return <Button onClick={handleClick} />;
}

// AFTER - Stable function reference
function Component() {
  const handleClick = useCallback(() => {
    /* ... */
  }, []); // Dependencies here
  return <Button onClick={handleClick} />;
}
```

**Rule of Thumb**: Wrap callbacks passed to memoized components in `useCallback`

---

## 📊 PERFORMANCE MEASUREMENT

### Before Optimization

```bash
# Use React DevTools Profiler
npm run dev
# Open React DevTools → Profiler
# Record interaction (e.g., open modal)
# Check render times
```

**Target Metrics:**
- HomePage render: Currently ~150ms → Target <50ms
- Modal open: Currently ~80ms → Target <30ms
- Field interaction: Currently ~60ms → Target <20ms

### After Optimization

Run same measurements and compare.

---

## 🧪 TESTING STRATEGY

### Performance Tests

```typescript
// tests/performance/render-performance.test.tsx
describe('Performance benchmarks', () => {
  it('HomePage renders in <50ms', async () => {
    const startTime = performance.now();
    render(<HomePage />);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(50);
  });

  it('Opening modal does not re-render HomePage', () => {
    const { rerender } = render(<HomePage />);
    const renderCount = getRenderCount();

    // Open modal
    userEvent.click(screen.getByText('Open Stats'));

    // HomePage should not re-render
    expect(getRenderCount()).toBe(renderCount);
  });
});
```

### Lighthouse Performance Audit

```bash
# Build for production
npm run build

# Audit with Lighthouse
npx lighthouse http://localhost:3000 --view

# Target scores:
# - Performance: ≥90
# - Accessibility: ≥95
# - Best Practices: ≥95
# - SEO: ≥90
```

---

## ✅ ACCEPTANCE CRITERIA

- [ ] React DevTools Profiler shows <50ms render times
- [ ] No unnecessary re-renders detected
- [ ] Lighthouse performance score ≥90
- [ ] Smooth 60fps interactions on mid-range devices
- [ ] Battery usage on mobile not increased

---

## 🔍 TOOLS & RESOURCES

**React DevTools Profiler**:
- [Chrome Extension](https://chrome.google.com/webstore/detail/react-developer-tools)
- [Profiler Documentation](https://react.dev/reference/react/Profiler)

**Why Did You Render** (Development tool):
```bash
npm install --save-dev @welldone-software/why-did-you-render

# Add to dev environment only
if (process.env.NODE_ENV === 'development') {
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  whyDidYouRender(React);
}
```

---

## 📚 RELATED DOCUMENTS

- [P0: HomePage Refactoring](./P0-HomePage-Refactoring-Plan.md) (Primary fix)
- [Critical Fixes Overview](../../CRITICAL_FIXES_REQUIRED.md)

---

**Last Updated**: October 16, 2025
