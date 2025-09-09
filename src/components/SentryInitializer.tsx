'use client';

import { useEffect } from 'react';
import { initSentry } from '@/lib/sentry';

/**
 * Client-side Sentry initializer component
 * Initializes Sentry only on the client side
 */
export default function SentryInitializer() {
  useEffect(() => {
    // Initialize Sentry when component mounts (client-side only)
    initSentry();
  }, []);

  // This component doesn't render anything
  return null;
}