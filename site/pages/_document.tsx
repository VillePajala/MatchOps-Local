import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600&display=swap" rel="stylesheet" />
      </Head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Force dark mode immediately
              document.documentElement.classList.add('dark');
            `,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
