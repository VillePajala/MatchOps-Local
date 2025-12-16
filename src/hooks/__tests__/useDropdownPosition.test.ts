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

    it('should handle menu taller than viewport', () => {
      // Window height: 800, menuHeight: 1000 (exceeds viewport)
      // Element bottom: 400, space below: 400
      // Menu is too tall for either direction - should return consistent result
      const { result } = renderHook(() => useDropdownPosition({ menuHeight: 1000 }));
      const element = createMockElement(400);

      const openUpward = result.current.calculatePosition(element);

      // 400 < 1000 → opens upward (less likely to clip bottom of viewport)
      expect(openUpward).toBe(true);
    });
  });

  describe('multiple instances', () => {
    it('should handle multiple independent hook instances', () => {
      // Simulate multiple dropdown menus with different configurations
      const { result: result1 } = renderHook(() => useDropdownPosition({ menuHeight: 100 }));
      const { result: result2 } = renderHook(() => useDropdownPosition({ menuHeight: 200 }));
      const { result: result3 } = renderHook(() => useDropdownPosition({ menuHeight: 300 }));

      const element = createMockElement(650); // Space below: 150

      // Each instance should calculate independently based on its menuHeight
      expect(result1.current.calculatePosition(element)).toBe(false); // 150 >= 100
      expect(result2.current.calculatePosition(element)).toBe(true);  // 150 < 200
      expect(result3.current.calculatePosition(element)).toBe(true);  // 150 < 300
    });

    it('should not interfere when called simultaneously', () => {
      const { result: result1 } = renderHook(() => useDropdownPosition());
      const { result: result2 } = renderHook(() => useDropdownPosition());

      const elementTop = createMockElement(100);    // Space below: 700
      const elementBottom = createMockElement(700); // Space below: 100

      // Interleaved calls should not affect each other
      expect(result1.current.calculatePosition(elementTop)).toBe(false);
      expect(result2.current.calculatePosition(elementBottom)).toBe(true);
      expect(result1.current.calculatePosition(elementBottom)).toBe(true);
      expect(result2.current.calculatePosition(elementTop)).toBe(false);
    });
  });

  describe('stress tests', () => {
    it('should handle rapid position calculations', () => {
      const { result } = renderHook(() => useDropdownPosition());

      // Rapidly calculate positions 100 times
      const results: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        const bottom = (i % 2 === 0) ? 700 : 100; // Alternate between top and bottom
        results.push(result.current.calculatePosition(createMockElement(bottom)));
      }

      // Verify all calculations returned expected values
      results.forEach((openUpward, i) => {
        const expectedUpward = i % 2 === 0; // 700 → upward, 100 → downward
        expect(openUpward).toBe(expectedUpward);
      });
    });

    it('should handle rapid menuHeight changes', () => {
      const { result, rerender } = renderHook(
        ({ menuHeight }) => useDropdownPosition({ menuHeight }),
        { initialProps: { menuHeight: 150 } }
      );

      const element = createMockElement(600); // Space below: 200

      // Rapidly change menuHeight and verify correct calculations
      for (let height = 100; height <= 300; height += 50) {
        rerender({ menuHeight: height });
        const openUpward = result.current.calculatePosition(element);
        const expectedUpward = 200 < height; // Space below: 200
        expect(openUpward).toBe(expectedUpward);
      }
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
