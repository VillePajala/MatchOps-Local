/**
 * LoadingScreen - the app's launch/transition screen.
 *
 * Continues the OS splash seamlessly: the same badge (/icons/icon-512x512.png,
 * the manifest's 'any' icon) on the same flat canvas (#170a18 = manifest
 * background_color = --color-carbon), centred in the full viewport at roughly
 * the size Android's splash draws it. An amber ring draws itself around the
 * badge over a soft glow (static badge under prefers-reduced-motion).
 *
 * Server-rendered (page.tsx's first render), so the badge is in the initial
 * HTML - no empty-navy flash before hydration.
 *
 * `exiting`: the parent keeps this mounted for LOADING_SCREEN_EXIT_MS after
 * loading ends, as a non-interactive overlay that fades out over the screen
 * that already rendered underneath (Home is never delayed).
 *
 * Used for the initial load, auth transitions (page.tsx) and the game-data
 * load (HomePage.tsx).
 */
import Image from 'next/image';

/** How long the parent keeps an exiting LoadingScreen mounted (CSS fade is 260ms). */
export const LOADING_SCREEN_EXIT_MS = 300;

/** The badge image box. Its visible badge is ~85% of it (~156px), matching the
 *  badge size on the Android splash (maskable icon: 72% of 240dp, shown through
 *  the splash's 160dp circle, so ~160dp visible with only the cream rim trimmed). */
const LOGO_PX = 184;

interface LoadingScreenProps {
  /** Status text (always announced to screen readers). */
  message?: string;
  /** Hide the message visually (initial launch: the logo says enough). */
  hideMessage?: boolean;
  /** Fade out as an overlay over the next screen; ignores pointer events. */
  exiting?: boolean;
}

export function LoadingScreen({ message = 'Loading...', hideMessage = false, exiting = false }: LoadingScreenProps) {
  return (
    <div
      // z: while loading, under the offline banner (z-40) as when it was in flow;
      // while exiting, over the next screen (and the sidebar) but under modals (z-[60]).
      className={`loading-screen fixed inset-0 flex items-center justify-center bg-carbon font-ui ${exiting ? 'z-[55] loading-screen--exit pointer-events-none' : 'z-30'}`}
      role={exiting ? undefined : 'status'}
      aria-live={exiting ? undefined : 'polite'}
      aria-hidden={exiting || undefined}
      data-testid="loading-screen"
    >
      <div className="loading-screen__logo relative" style={{ width: LOGO_PX, height: LOGO_PX }}>
        <div className="loading-screen__glow" aria-hidden="true" />
        <Image
          src="/icons/icon-512x512.png"
          alt=""
          width={LOGO_PX}
          height={LOGO_PX}
          preload
          unoptimized
          draggable={false}
          className="relative block select-none"
        />
        <svg className="loading-screen__ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="loading-screen-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fadd15" />
              <stop offset="100%" stopColor="#f2b705" />
            </linearGradient>
          </defs>
          <circle className="loading-screen__track" cx="50" cy="50" r="48" />
          <circle className="loading-screen__arc" cx="50" cy="50" r="48" pathLength={100} stroke="url(#loading-screen-ring)" />
        </svg>
        <p
          className={
            hideMessage
              ? 'sr-only'
              : 'absolute left-1/2 top-full mt-8 -translate-x-1/2 whitespace-nowrap text-ink-3 text-sm'
          }
        >
          {message}
        </p>
      </div>
    </div>
  );
}

export default LoadingScreen;
