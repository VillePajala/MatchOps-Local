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
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900">
      <div className="flex flex-col items-center gap-6">
        {/* Spinner */}
        <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />

        {/* Loading text */}
        <p className="text-slate-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

export default LoadingScreen;
