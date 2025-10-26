import Layout from '@/components/Layout';
import { FaChrome, FaFirefox, FaSafari, FaEdge, FaMobileAlt, FaDesktop, FaCheckCircle, FaQuestionCircle } from 'react-icons/fa';

export default function Download() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-16">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Get Started in 3 Easy Steps
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            No signup, no installation hassles. Start coaching in under a minute.
          </p>
        </div>
      </section>

      {/* Installation Steps */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom max-w-4xl">
          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                1
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  Open in Your Browser
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  Visit <a href="https://matchops.app" className="text-primary hover:underline font-semibold" target="_blank" rel="noopener noreferrer">matchops.app</a> on any modern browser.
                  Works on desktop and mobile devices.
                </p>
                <a
                  href="https://matchops.app"
                  className="btn btn-primary inline-block"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open MatchOps-Local
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                2
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  Install (Optional)
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  For the best experience, install MatchOps-Local as a Progressive Web App:
                </p>
                <div className="space-y-4">
                  <div className="card">
                    <div className="flex items-center mb-3">
                      <FaMobileAlt className="text-primary text-2xl mr-3" />
                      <h3 className="font-bold text-gray-900 dark:text-white">On Mobile</h3>
                    </div>
                    <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>iOS Safari:</strong> Tap the Share button, then &quot;Add to Home Screen&quot;</span>
                      </li>
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Android Chrome:</strong> Tap the menu (⋮), then &quot;Install App&quot; or &quot;Add to Home Screen&quot;</span>
                      </li>
                    </ul>
                  </div>
                  <div className="card">
                    <div className="flex items-center mb-3">
                      <FaDesktop className="text-primary text-2xl mr-3" />
                      <h3 className="font-bold text-gray-900 dark:text-white">On Desktop</h3>
                    </div>
                    <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Chrome/Edge:</strong> Look for the install icon (⊕) in the address bar, or open menu → &quot;Install MatchOps-Local&quot;</span>
                      </li>
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Firefox:</strong> Click the install prompt that appears, or check the address bar for install option</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                3
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  Start Coaching
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  That&apos;s it! No account required, no signup forms. The app is ready to use immediately.
                </p>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>Add your players to the master roster</span>
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>Create your first team</span>
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>Start a new game and begin tracking</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Browser Support */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Supported Browsers
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              MatchOps-Local works on all modern browsers
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="card text-center">
              <FaChrome className="text-5xl text-blue-500 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Chrome</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">90+</p>
            </div>
            <div className="card text-center">
              <FaFirefox className="text-5xl text-orange-500 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Firefox</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">88+</p>
            </div>
            <div className="card text-center">
              <FaSafari className="text-5xl text-blue-400 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Safari</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">14+</p>
            </div>
            <div className="card text-center">
              <FaEdge className="text-5xl text-blue-600 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Edge</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">90+</p>
            </div>
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              System Requirements
            </h2>
          </div>

          <div className="card">
            <ul className="space-y-4">
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900 dark:text-white">Modern Web Browser:</strong>
                  <span className="text-gray-600 dark:text-gray-400"> Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900 dark:text-white">JavaScript Enabled:</strong>
                  <span className="text-gray-600 dark:text-gray-400"> Standard for all modern browsers</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900 dark:text-white">IndexedDB Support:</strong>
                  <span className="text-gray-600 dark:text-gray-400"> Available in all supported browsers</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900 dark:text-white">Storage Space:</strong>
                  <span className="text-gray-600 dark:text-gray-400"> ~50MB available (typical usage is much less)</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            <div className="card">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    Do I need to create an account?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    No! MatchOps-Local works immediately without any signup or account creation.
                    Just open the app and start using it.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    Does it work offline?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Yes! Once loaded, MatchOps-Local works completely offline. Perfect for
                    soccer fields with poor internet connectivity.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    What about updates?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Updates are automatic when you have an internet connection. The app will
                    notify you when a new version is available and update seamlessly.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    Can I export my data?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Absolutely! You can export your complete data set at any time in JSON format.
                    Your data is yours to keep, backup, and use however you need.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                    Is my data safe?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Yes! All data is stored locally on your device using browser IndexedDB.
                    Nothing is transmitted to external servers, ensuring complete privacy and control.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container-custom text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Open MatchOps-Local now and start coaching smarter
          </p>
          <a
            href="https://matchops.app"
            className="btn bg-white text-primary hover:bg-gray-100 text-lg px-8 py-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            Launch MatchOps-Local
          </a>
          <p className="text-sm mt-4 opacity-75">
            No installation required • Works immediately • Your data stays private
          </p>
        </div>
      </section>
    </Layout>
  );
}
