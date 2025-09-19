'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import styles from './global-error.module.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report error to Sentry
    Sentry.captureException(error);
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