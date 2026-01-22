'use client';

/**
 * WelcomeScreen Component
 *
 * First-install welcome screen that lets users choose their onboarding path:
 * - Start Fresh (local mode) - data stays on device
 * - Sign In to Cloud - sync across devices
 * - Import Backup - restore from exported file
 *
 * Only shown once on first launch. After user makes a choice,
 * the welcome flag is set and this screen won't show again.
 *
 * @see docs/03-active-plans/cloud-sync-user-flows.md
 */

interface WelcomeScreenProps {
  /** Called when user chooses "Start Fresh" (local mode) */
  onStartLocal: () => void;
  /** Called when user chooses "Sign In to Cloud" */
  onSignInCloud: () => void;
  /** Called when user chooses "Import Backup" */
  onImportBackup: () => void;
  /** Whether cloud option should be shown (Supabase configured) */
  isCloudAvailable: boolean;
  /** Whether import is currently in progress */
  isImporting: boolean;
}

export default function WelcomeScreen({
  onStartLocal,
  onSignInCloud,
  onImportBackup,
  isCloudAvailable,
  isImporting,
}: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Title Section */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            Welcome to MatchOps!
          </h1>
          <p className="mt-3 text-slate-400">
            Track your team&apos;s games, players, and stats
          </p>
        </div>

        {/* Option Buttons */}
        <div className="space-y-4">
          {/* Start Fresh (Local) */}
          <button
            onClick={onStartLocal}
            className="w-full p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label="Start fresh in local mode"
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl" role="img" aria-hidden="true">
                🏠
              </span>
              <div>
                <div className="text-white font-medium text-lg">Start Fresh</div>
                <div className="text-slate-400 text-sm">
                  Data stays on this device
                </div>
              </div>
            </div>
          </button>

          {/* Sign In to Cloud - only if Supabase is configured */}
          {isCloudAvailable && (
            <button
              onClick={onSignInCloud}
              className="w-full p-4 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded-xl text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Sign in to cloud sync"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl" role="img" aria-hidden="true">
                  ☁️
                </span>
                <div>
                  <div className="text-white font-medium text-lg">
                    Sign In to Cloud
                  </div>
                  <div className="text-indigo-200 text-sm">
                    Sync across all your devices
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Import Backup */}
          <button
            onClick={onImportBackup}
            disabled={isImporting}
            className="w-full p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
            aria-label={isImporting ? 'Importing backup file' : 'Import backup file'}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl" role="img" aria-hidden="true">
                📁
              </span>
              <div>
                <div className="text-white font-medium text-lg">
                  {isImporting ? 'Importing...' : 'Import Backup'}
                </div>
                <div className="text-slate-400 text-sm">
                  Restore from exported file
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-slate-500 text-sm pt-4">
          You can change this later in Settings
        </p>
      </div>
    </div>
  );
}
