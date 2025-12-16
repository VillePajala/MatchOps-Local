import { renderHook } from '@testing-library/react';
import { useDropdownPosition } from '../useDropdownPosition';

describe('useDropdownPosition', () => {
  const originalInnerHeight = window.innerHeight;

  // Helper to create mock element with getBoundingClientRect
  const createMockElement = (bottom: number): HTMLElement => ({
    getBoundingClientRect: () => ({
      bottom,
      top: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }) as unknown as HTMLElement;

  beforeEach(() => {
    // Set consistent viewport height for tests
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    // Restore original value
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  describe('hook return value', () => {
    it('should return calculatePosition function', () => {
      const { result } = renderHook(() => useDropdownPosition());
      expect(typeof result.current.calculatePosition).toBe('function');
    });
  });

  describe('calculatePosition', () => {
    it('should return false (downward) when sufficient space below', () => {
      // Window height: 800, element bottom: 500, space below: 300
      // Default menuHeight: 150, so 300 >= 150 → downward (false)
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(500);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(false);
    });

    it('should return true (upward) when insufficient space below', () => {
      // Window height: 800, element bottom: 700, space below: 100
      // Default menuHeight: 150, so 100 < 150 → upward (true)
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(700);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(true);
    });

    it('should return false (downward) when exactly at threshold', () => {
      // Window height: 800, element bottom: 650, space below: 150
      // Default menuHeight: 150, so 150 >= 150 → downward (false)
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(650);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(false);
    });

    it('should return true (upward) when 1px below threshold', () => {
      // Window height: 800, element bottom: 651, space below: 149
      // Default menuHeight: 150, so 149 < 150 → upward (true)
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(651);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(true);
    });

    it('should return false for null element', () => {
      const { result } = renderHook(() => useDropdownPosition());

      const openUpward = result.current.calculatePosition(null);

      expect(openUpward).toBe(false);
    });

    it('should return correct values on subsequent calls', () => {
      const { result } = renderHook(() => useDropdownPosition());

      // First call: element near bottom → upward
      expect(result.current.calculatePosition(createMockElement(700))).toBe(true);

      // Second call: element near top → downward
      expect(result.current.calculatePosition(createMockElement(100))).toBe(false);
    });
  });

  describe('custom menuHeight option', () => {
    it('should use custom menuHeight for calculation', () => {
      // Window height: 800, element bottom: 700, space below: 100
      // Custom menuHeight: 80, so 100 >= 80 → downward (false)
      const { result } = renderHook(() => useDropdownPosition({ menuHeight: 80 }));
      const element = createMockElement(700);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(false);
    });

    it('should return true (upward) with large custom menuHeight', () => {
      // Window height: 800, element bottom: 500, space below: 300
      // Custom menuHeight: 400, so 300 < 400 → upward (true)
      const { result } = renderHook(() => useDropdownPosition({ menuHeight: 400 }));
      const element = createMockElement(500);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(true);
    });

    it('should return false with menuHeight of 0', () => {
      // Space below: any value >= 0 → always downward (false)
      const { result } = renderHook(() => useDropdownPosition({ menuHeight: 0 }));
      const element = createMockElement(799); // Only 1px space below

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for element at very top of viewport', () => {
      // Element bottom: 50, space below: 750 → plenty of room
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(50);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(false);
    });

    it('should return true for element at very bottom of viewport', () => {
      // Element bottom: 800, space below: 0 → no room
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(800);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(true);
    });

    it('should return true for element beyond viewport (scrolled)', () => {
      // Element bottom: 900 (beyond viewport of 800), space below: -100
      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(900);

      const openUpward = result.current.calculatePosition(element);

      expect(openUpward).toBe(true);
    });

    it('should handle small viewport correctly', () => {
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 200,
      });

      const { result } = renderHook(() => useDropdownPosition());
      const element = createMockElement(100);

      const openUpward = result.current.calculatePosition(element);

      // Space below: 100, menuHeight: 150 → upward (true)
      expect(openUpward).toBe(true);
    });
  });

  describe('function stability', () => {
    it('should return same function reference across renders', () => {
      const { result, rerender } = renderHook(() => useDropdownPosition());
      const firstCalculatePosition = result.current.calculatePosition;

      rerender();

      expect(result.current.calculatePosition).toBe(firstCalculatePosition);
    });

    it('should return new function when menuHeight changes', () => {
      const { result, rerender } = renderHook(
        ({ menuHeight }) => useDropdownPosition({ menuHeight }),
        { initialProps: { menuHeight: 150 } }
      );
      const firstCalculatePosition = result.current.calculatePosition;

      rerender({ menuHeight: 200 });

      expect(result.current.calculatePosition).not.toBe(firstCalculatePosition);
    });
  });
});
