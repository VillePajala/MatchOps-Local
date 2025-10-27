import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import { appWithTranslation } from 'next-i18next';
import { Rajdhani } from 'next/font/google';
import { useEffect } from 'react';

// Configure Rajdhani font - same as main app
const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-rajdhani',
});

function App({ Component, pageProps }: AppProps) {
  // Force dark mode on mount
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className={rajdhani.variable}>
      <Component {...pageProps} />
    </div>
  );
}

export default appWithTranslation(App);
