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
      Sentry.captureException(error);
    } catch {
      // Sentry failure must not affect error boundary rendering
    }
  }, [error]);

  return (
    <html>
      <body>
        <div className={styles.errorContainer}>
          <div className={styles.errorCard}>
            <h1 className={styles.errorTitle}>
              Something went wrong!
            </h1>
            <p className={styles.errorMessage}>
              An unexpected error occurred. The error has been reported and we&apos;re working to fix it.
            </p>
            <div className={styles.buttonGroup}>
              <button
                onClick={reset}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className={`${styles.button} ${styles.buttonSecondary}`}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}