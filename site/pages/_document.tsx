import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        {/* Force dark mode as default */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
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
