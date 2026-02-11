'use client';

interface TransitionOverlayProps {
  message: string;
}

/**
 * Full-screen overlay shown during the brief delay before window.location.reload().
 * Replaces the old pattern of showing a toast + setTimeout + reload.
 * Blocks all interaction while the page transitions.
 */
export default function TransitionOverlay({ message }: TransitionOverlayProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
      <div className="flex flex-col items-center gap-4 px-6">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-indigo-400"
          role="status"
          aria-label={message}
        />
        <p className="text-lg font-medium text-slate-200 text-center">
          {message}
        </p>
      </div>
    </div>
  );
}
