import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - MatchOps',
  description: 'Privacy policy for the MatchOps soccer coaching application',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy for MatchOps</h1>
        <p className="text-slate-400 mb-8">Last Updated: December 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Overview</h2>
          <p className="text-slate-300">
            MatchOps (&quot;we&quot;, &quot;our&quot;, &quot;the app&quot;) is a local-first soccer coaching
            application. This privacy policy explains how we handle your information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data Storage</h2>
          <h3 className="text-lg font-medium mb-2 text-slate-300">Local Data</h3>
          <p className="text-slate-300 mb-3">All your data is stored locally on your device:</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">
            <li>Player rosters and information</li>
            <li>Game records and statistics</li>
            <li>Settings and preferences</li>
            <li>Season and tournament data</li>
          </ul>
          <p className="text-slate-300 font-medium mb-4">
            We do not have access to this data. It never leaves your device unless you explicitly export it.
          </p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">No Account Required</h3>
          <p className="text-slate-300">
            MatchOps works entirely offline. No account creation, login, or personal information is
            required to use the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data We May Collect</h2>
          <h3 className="text-lg font-medium mb-2 text-slate-300">Error Reporting (Optional)</h3>
          <p className="text-slate-300 mb-2">When the app encounters an error, we may collect:</p>
          <ul className="list-disc list-inside text-slate-300 mb-3 space-y-1">
            <li>Error type and stack trace</li>
            <li>Device type and OS version</li>
            <li>App version</li>
            <li>Anonymized session information</li>
          </ul>
          <p className="text-slate-300 mb-4">
            This helps us fix bugs and improve the app. Error reports do not contain your game data
            or player information, are processed by Sentry.io, and can be disabled in app settings.
          </p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">Play Store License Validation</h3>
          <p className="text-slate-300">
            When you purchase premium features, Google Play handles all payment processing. We verify
            license status through Play Store API but do not receive your payment information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data We Do NOT Collect</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Names or personal details of players in your roster</li>
            <li>Game content, scores, or statistics</li>
            <li>Location data</li>
            <li>Photos or media</li>
            <li>Contact information</li>
            <li>Device identifiers for tracking</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Third-Party Services</h2>
          <div className="space-y-3 text-slate-300">
            <p>
              <strong>Google Play Store</strong> - Handles app distribution and payments.{' '}
              <a href="https://policies.google.com/privacy" className="text-indigo-400 hover:underline">
                Google&apos;s Privacy Policy
              </a>
            </p>
            <p>
              <strong>Sentry</strong> - Processes crash reports and errors.{' '}
              <a href="https://sentry.io/privacy/" className="text-indigo-400 hover:underline">
                Sentry&apos;s Privacy Policy
              </a>
            </p>
            <p>
              <strong>Vercel</strong> - Hosts the PWA version.{' '}
              <a href="https://vercel.com/legal/privacy-policy" className="text-indigo-400 hover:underline">
                Vercel&apos;s Privacy Policy
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Your Rights</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li><strong>Export your data</strong> using the app&apos;s export feature</li>
            <li><strong>Delete your data</strong> by clearing app data or uninstalling</li>
            <li><strong>Disable error reporting</strong> in app settings</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Children&apos;s Privacy</h2>
          <p className="text-slate-300">
            MatchOps does not knowingly collect information from children. The app stores player
            names locally as entered by the coach - these are controlled entirely by you and never
            transmitted to us.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data Security</h2>
          <p className="text-slate-300 mb-2">Your data is protected by:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Device-level encryption (provided by Android)</li>
            <li>Local-only storage</li>
            <li>No network transmission of game data</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Changes to This Policy</h2>
          <p className="text-slate-300">
            We may update this policy occasionally. Changes will be noted by the &quot;Last Updated&quot; date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Contact</h2>
          <p className="text-slate-300">For privacy questions or concerns:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              Email:{' '}
              <a href="mailto:valoraami@gmail.com" className="text-indigo-400 hover:underline">
                valoraami@gmail.com
              </a>
            </li>
            <li>
              GitHub Issues:{' '}
              <a
                href="https://github.com/VillePajala/MatchOps-Local/issues"
                className="text-indigo-400 hover:underline"
              >
                github.com/VillePajala/MatchOps-Local/issues
              </a>
            </li>
          </ul>
        </section>

        <hr className="border-slate-700 my-8" />
        <p className="text-slate-500 text-sm italic">
          This privacy policy applies to the MatchOps application available on Google Play Store.
        </p>
      </div>
    </div>
  );
}
