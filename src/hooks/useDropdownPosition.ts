import { useState, useCallback } from 'react';

interface UseDropdownPositionOptions {
  /** Estimated menu height in pixels (default: 150) */
  menuHeight?: number;
}

/**
 * Hook to determine if a dropdown menu should open upward or downward
 * based on available viewport space.
 *
 * Works well with lists where you can't have separate refs for each item.
 * Call calculatePosition in the button's onClick handler.
 *
 * @param options - Configuration options
 * @returns Object with openUpward boolean and calculatePosition function
 *
 * @example
 * const { openUpward, calculatePosition } = useDropdownPosition();
 *
 * <button onClick={(e) => {
 *   calculatePosition(e.currentTarget);
 *   setMenuOpen(!menuOpen);
 * }}>
 *
 * <div className={openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}>
 */
export function useDropdownPosition(options: UseDropdownPositionOptions = {}) {
  const { menuHeight = 150 } = options;
  const [openUpward, setOpenUpward] = useState(false);

  const calculatePosition = useCallback((triggerElement: HTMLElement | null) => {
    if (!triggerElement) return;

    const rect = triggerElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUpward(spaceBelow < menuHeight);
  }, [menuHeight]);

  return { openUpward, calculatePosition };
}
