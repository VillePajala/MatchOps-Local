'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import styles from './global-error.module.css';

/**
 * Global error boundary for Next.js App Router
 *
 * IMPORTANT: This component MUST include <html> and <body> tags as per Next.js requirements.
 * The global-error.tsx file is special - it replaces the entire page when an error occurs,
 * including the root layout. Therefore, it needs to provide the full HTML structure.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report error to Sentry
    // Wrapped in try/catch to prevent Sentry SDK failures from breaking error boundary
    try {
      Sentry.captureException(error, {
        tags: { handler: 'global-error-boundary' },
      });
    } catch {
      // Sentry failure must not affect error boundary rendering
    }
  }, [error]);

  return (
    <html lang="fi">
      <body>
        <div className={styles.errorContainer}>
          <div className={styles.errorCard}>
            <h1 className={styles.errorTitle}>
              <span lang="fi">Jokin meni pieleen!</span>
              {' / '}
              <span lang="en">Something went wrong!</span>
            </h1>
            <p className={styles.errorMessage}>
              <span lang="fi">Odottamaton virhe tapahtui. Virhe on raportoitu ja korjaamme sen.</span>
              <br />
              <span lang="en">An unexpected error occurred. The error has been reported and we&apos;re working to fix it.</span>
            </p>
            <div className={styles.buttonGroup}>
              <button
                onClick={reset}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                <span lang="fi">Yrit&auml; uudelleen</span>
                {' / '}
                <span lang="en">Try again</span>
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className={`${styles.button} ${styles.buttonSecondary}`}
              >
                <span lang="fi">Etusivulle</span>
                {' / '}
                <span lang="en">Go home</span>
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}