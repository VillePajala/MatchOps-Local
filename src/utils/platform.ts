/**
 * Platform detection utilities for billing
 *
 * Used to determine which billing/subscription UI to show:
 * - Android: Can use Play Billing for subscriptions
 * - Desktop/iOS: Sign-in only, subscriptions require Android app
 *
 * @see docs/03-active-plans/billing-implementation-plan.md
 */

/**
 * Detect if running on Android device
 */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Detect if running on iOS device
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Detect if running on desktop (not mobile)
 */
export function isDesktop(): boolean {
  return !isAndroid() && !isIOS();
}

/**
 * Check if Play Billing is potentially available
 * Actual availability is confirmed via Digital Goods API
 */
export function canUsePlayBilling(): boolean {
  return isAndroid();
}

/**
 * Check if Digital Goods API is available (TWA context)
 * This API is only available when running as a Trusted Web Activity
 * installed from Google Play Store
 */
export async function isDigitalGoodsAvailable(): Promise<boolean> {
  if (!isAndroid()) return false;

  try {
    // Digital Goods API only available in TWA context
    if ('getDigitalGoodsService' in window) {
      const service = await (window as unknown as { getDigitalGoodsService: (url: string) => Promise<unknown> })
        .getDigitalGoodsService('https://play.google.com/billing');
      return service !== null;
    }
    return false;
  } catch {
    return false;
  }
}
