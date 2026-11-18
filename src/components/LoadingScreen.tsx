/**
 * LoadingScreen - Reusable loading indicator component.
 *
 * Displays a full-screen loading spinner with an optional message.
 * Used during auth transitions (login/logout) and data loading.
 */

interface LoadingScreenProps {
  /** Message to display below the spinner */
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="s1-canvas flex flex-col items-center justify-center min-h-screen min-h-[100dvh] font-ui" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-6">
        {/* Spinner */}
        <div className="w-16 h-16 border-4 border-white/10 border-t-action rounded-full animate-spin" aria-hidden="true" />

        {/* Loading text */}
        <p className="text-ink-3 text-sm">{message}</p>
      </div>
    </div>
  );
}

export default LoadingScreen;
