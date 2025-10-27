import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import { appWithTranslation } from 'next-i18next';
import { useEffect } from 'react';

function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Force dark mode on client side to align with app visuals
    if (typeof window !== 'undefined') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return <Component {...pageProps} />;
}

export default appWithTranslation(App);
