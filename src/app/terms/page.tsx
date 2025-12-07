import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - MatchOps',
  description: 'Terms of Service for the MatchOps soccer coaching application',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Terms of Service for MatchOps</h1>
        <p className="text-slate-400 mb-8">Last Updated: December 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Agreement to Terms</h2>
          <p className="text-slate-300">
            By downloading, installing, or using MatchOps (&quot;the app&quot;), you agree to these
            Terms of Service. If you do not agree, do not use the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Description of Service</h2>
          <p className="text-slate-300 mb-3">
            MatchOps is a local-first soccer coaching application that helps coaches:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Track game time and scores</li>
            <li>Manage player rosters</li>
            <li>Record player statistics</li>
            <li>Organize seasons and tournaments</li>
          </ul>
          <p className="text-slate-300 mt-3">All data is stored locally on your device.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">License Grant</h2>
          <p className="text-slate-300 mb-3">
            We grant you a limited, non-exclusive, non-transferable, revocable license to use
            MatchOps for personal, non-commercial purposes in accordance with these terms.
          </p>
          <p className="text-slate-300 mb-2">You may NOT:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Reverse engineer, decompile, or disassemble the app</li>
            <li>Modify, adapt, or create derivative works</li>
            <li>Distribute, sublicense, or transfer the app to others</li>
            <li>Use the app for any illegal purpose</li>
            <li>Remove any copyright or proprietary notices</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">User Responsibilities</h2>
          <p className="text-slate-300 mb-2">You are responsible for:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>All data you enter into the app</li>
            <li>Maintaining backups of your data (using the export feature)</li>
            <li>Ensuring your use complies with applicable laws</li>
            <li>Any activity that occurs through your use of the app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data and Privacy</h2>
          <p className="text-slate-300">
            Your data is stored locally on your device. We do not have access to your game data,
            player information, or statistics. See our{' '}
            <Link href="/privacy-policy" className="text-indigo-400 hover:underline">
              Privacy Policy
            </Link>{' '}
            for details on what limited data we may collect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Intellectual Property</h2>
          <p className="text-slate-300">
            MatchOps and all related trademarks, logos, and content are the property of the
            developer. You do not acquire any ownership rights by using the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Disclaimer of Warranties</h2>
          <p className="text-slate-300 mb-3 uppercase text-sm">
            The app is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
            any kind, express or implied, including but not limited to:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4">
            <li>Merchantability</li>
            <li>Fitness for a particular purpose</li>
            <li>Non-infringement</li>
            <li>Accuracy or reliability of data</li>
          </ul>
          <p className="text-slate-300">We do not warrant that the app will meet your specific requirements, be uninterrupted, timely, secure, or error-free, or that any errors will be corrected.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Limitation of Liability</h2>
          <p className="text-slate-300 mb-3 uppercase text-sm">
            To the maximum extent permitted by law, in no event shall the developer be liable for
            any indirect, incidental, special, consequential, or punitive damages, loss of data,
            profits, or business opportunities.
          </p>
          <p className="text-slate-300">
            Our total liability shall not exceed the amount you paid for the app (if any).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Data Loss</h2>
          <p className="text-slate-300 mb-2">You acknowledge that:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Data is stored locally on your device</li>
            <li>
              We are not responsible for data loss due to device failure, app uninstallation, or any
              other cause
            </li>
            <li>You should regularly export and backup important data</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Third-Party Services</h2>
          <p className="text-slate-300 mb-2">The app may interact with third-party services:</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong>Google Play Store</strong> - For app distribution and payments
            </li>
            <li>
              <strong>Sentry</strong> - For error reporting (optional)
            </li>
          </ul>
          <p className="text-slate-300 mt-2">
            Your use of these services is governed by their respective terms and policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Changes to the App</h2>
          <p className="text-slate-300">
            We reserve the right to modify or discontinue the app at any time, update these terms
            with reasonable notice, and add or remove features.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Termination</h2>
          <p className="text-slate-300">
            We may terminate or suspend your access to the app immediately, without notice, if you
            breach these terms. Upon termination, your license to use the app ends.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Governing Law</h2>
          <p className="text-slate-300">
            These terms are governed by the laws of Finland, without regard to conflict of law
            principles.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Contact</h2>
          <p className="text-slate-300">For questions about these terms:</p>
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
          These Terms of Service apply to the MatchOps application available on Google Play Store.
        </p>
      </div>
    </div>
  );
}
