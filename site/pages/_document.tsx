import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        {/* Set dark mode as default */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (!('theme' in localStorage)) {
                  document.documentElement.classList.add('dark');
                  localStorage.theme = 'dark';
                } else if (localStorage.theme === 'dark') {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
