import { renderHook, act } from '@testing-library/react';
import {
  deviceHasSignedIn,
  markDeviceHasSignedIn,
  resetDeviceSignInMemoryForTests,
  useDeviceHasSignedIn,
} from '../deviceSignInMemory';

beforeEach(() => {
  localStorage.clear();
  resetDeviceSignInMemoryForTests();
});

describe('deviceSignInMemory', () => {
  /** @critical - decides whether a returning coach lands on Sign in or Create account. */
  it('is false on a fresh device and true once any account has signed in', () => {
    expect(deviceHasSignedIn()).toBe(false);
    markDeviceHasSignedIn();
    expect(deviceHasSignedIn()).toBe(true);
    expect(localStorage.getItem('matchops_device_signed_in')).toBe('1');
  });

  it('notifies subscribers so an open login screen can switch form', () => {
    const { result } = renderHook(() => useDeviceHasSignedIn());
    expect(result.current).toBe(false);
    act(() => markDeviceHasSignedIn());
    expect(result.current).toBe(true);
  });

  it('treats unavailable storage as a fresh device', () => {
    const spy = jest.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(deviceHasSignedIn()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('reads storage once and serves the cached value afterwards', () => {
    const spy = jest.spyOn(window.localStorage, 'getItem');
    deviceHasSignedIn();
    deviceHasSignedIn();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
