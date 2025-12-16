import { useCallback } from 'react';

interface UseDropdownPositionOptions {
  /** Estimated menu height in pixels (default: 150) */
  menuHeight?: number;
}

/**
 * Hook to determine if a dropdown menu should open upward or downward
 * based on available viewport space.
 *
 * Returns the position synchronously to avoid race conditions with menu state.
 *
 * @param options - Configuration options
 * @returns calculatePosition function that returns true if menu should open upward
 *
 * @example
 * const { calculatePosition } = useDropdownPosition();
 * const [openUpward, setOpenUpward] = useState(false);
 *
 * <button onClick={(e) => {
 *   setOpenUpward(calculatePosition(e.currentTarget));
 *   setMenuOpen(!menuOpen);
 * }}>
 *
 * <div className={openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}>
 */
export function useDropdownPosition(options: UseDropdownPositionOptions = {}) {
  const { menuHeight = 150 } = options;

  const calculatePosition = useCallback((triggerElement: HTMLElement | null): boolean => {
    if (!triggerElement) return false;

    const rect = triggerElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    return spaceBelow < menuHeight;
  }, [menuHeight]);

  return { calculatePosition };
}
