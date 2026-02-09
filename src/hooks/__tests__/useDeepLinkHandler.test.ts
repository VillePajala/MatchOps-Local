/**
 * Tests for useDeepLinkHandler hook
 * @integration - PWA shortcut deep link parsing and URL cleanup
 *
 * Note: Uses window.history.pushState to set JSDOM's URL (the standard
 * JSDOM-compatible way) and mocks replaceState separately for assertions.
 */

import { renderHook, act } from '@testing-library/react';
import { useDeepLinkHandler } from '../useDeepLinkHandler';

describe('useDeepLinkHandler', () => {
  const originalReplaceState = window.history.replaceState;
  let mockReplaceState: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset URL to root using the real pushState (JSDOM updates location internally)
    window.history.pushState({}, '', '/');
    // Mock replaceState to track calls from the hook
    mockReplaceState = jest.fn();
    window.history.replaceState = mockReplaceState;
  });

  afterEach(() => {
    // Restore original replaceState
    window.history.replaceState = originalReplaceState;
    // Reset URL
    window.history.pushState({}, '', '/');
  });

  describe('valid action parameters', () => {
    it('should parse action=newGame and return initialAction "newGame"', () => {
      window.history.pushState({}, '', '/?action=newGame');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('newGame');
      expect(result.current.hasDeepLink).toBe(true);
    });

    it('should parse action=loadGame', () => {
      window.history.pushState({}, '', '/?action=loadGame');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('loadGame');
      expect(result.current.hasDeepLink).toBe(true);
    });

    it('should parse action=stats', () => {
      window.history.pushState({}, '', '/?action=stats');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('stats');
      expect(result.current.hasDeepLink).toBe(true);
    });

    it('should parse action=roster', () => {
      window.history.pushState({}, '', '/?action=roster');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('roster');
      expect(result.current.hasDeepLink).toBe(true);
    });

    it('should parse action=settings', () => {
      window.history.pushState({}, '', '/?action=settings');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('settings');
      expect(result.current.hasDeepLink).toBe(true);
    });
  });

  describe('no action parameter', () => {
    it('should return null initialAction when URL has no query params', () => {
      // URL is already '/' from beforeEach
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBeNull();
      expect(result.current.hasDeepLink).toBe(false);
    });

    it('should return null initialAction when URL has other params but no action', () => {
      window.history.pushState({}, '', '/?foo=bar&baz=qux');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBeNull();
      expect(result.current.hasDeepLink).toBe(false);
    });
  });

  describe('unknown action parameter', () => {
    it('should return null for unknown action value', () => {
      window.history.pushState({}, '', '/?action=unknownAction');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBeNull();
      expect(result.current.hasDeepLink).toBe(false);
    });

    it('should return null for empty action value', () => {
      window.history.pushState({}, '', '/?action=');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBeNull();
      expect(result.current.hasDeepLink).toBe(false);
    });
  });

  describe('URL cleanup', () => {
    it('should call replaceState to clean URL when valid action is found', () => {
      window.history.pushState({}, '', '/?action=newGame');
      renderHook(() => useDeepLinkHandler());
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/');
    });

    it('should NOT call replaceState when no action param is present', () => {
      // URL is already '/' from beforeEach
      renderHook(() => useDeepLinkHandler());
      expect(mockReplaceState).not.toHaveBeenCalled();
    });

    it('should NOT call replaceState for unknown action values', () => {
      window.history.pushState({}, '', '/?action=invalid');
      renderHook(() => useDeepLinkHandler());
      expect(mockReplaceState).not.toHaveBeenCalled();
    });
  });

  describe('mount-only processing', () => {
    it('should not re-parse URL on re-render', () => {
      window.history.pushState({}, '', '/?action=newGame');
      const { result, rerender } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('newGame');
      expect(mockReplaceState).toHaveBeenCalledTimes(1);

      // Change URL and re-render — hook should still have original value
      window.history.pushState({}, '', '/?action=stats');
      mockReplaceState.mockClear();
      rerender();

      expect(result.current.initialAction).toBe('newGame');
      expect(mockReplaceState).not.toHaveBeenCalled();
    });
  });

  describe('setAction callback', () => {
    it('should update initialAction when called with a valid action', () => {
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBeNull();
      act(() => { result.current.setAction('roster'); });
      expect(result.current.initialAction).toBe('roster');
    });

    it('should set initialAction to null when called with "getStarted"', () => {
      window.history.pushState({}, '', '/?action=newGame');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('newGame');
      act(() => { result.current.setAction('getStarted'); });
      expect(result.current.initialAction).toBeNull();
    });
  });

  describe('clearAction callback', () => {
    it('should set initialAction to null', () => {
      window.history.pushState({}, '', '/?action=newGame');
      const { result } = renderHook(() => useDeepLinkHandler());
      expect(result.current.initialAction).toBe('newGame');
      act(() => { result.current.clearAction(); });
      expect(result.current.initialAction).toBeNull();
    });
  });

  describe('callback reference stability', () => {
    it('should return stable setAction and clearAction references across re-renders', () => {
      const { result, rerender } = renderHook(() => useDeepLinkHandler());
      const firstSetAction = result.current.setAction;
      const firstClearAction = result.current.clearAction;
      rerender();
      expect(result.current.setAction).toBe(firstSetAction);
      expect(result.current.clearAction).toBe(firstClearAction);
    });
  });
});
