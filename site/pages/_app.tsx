import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import { appWithTranslation } from 'next-i18next';
import { Inter, Rajdhani } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['700'], variable: '--font-rajdhani', display: 'swap' });

function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.className} ${rajdhani.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}

export default appWithTranslation(App);
