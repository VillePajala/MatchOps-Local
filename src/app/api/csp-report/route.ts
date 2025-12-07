import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * CSP Violation Report Endpoint
 *
 * Receives Content Security Policy violation reports from browsers.
 * Reports are logged to Sentry for monitoring in production.
 *
 * This helps identify:
 * - CSP rules that are too strict and breaking features
 * - Potential XSS attempts being blocked
 * - Third-party scripts being blocked unexpectedly
 */

interface CSPViolationReport {
  'csp-report': {
    'document-uri': string;
    'violated-directive': string;
    'effective-directive': string;
    'original-policy': string;
    'blocked-uri': string;
    'status-code': number;
    'source-file'?: string;
    'line-number'?: number;
    'column-number'?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const report: CSPViolationReport = await request.json();
    const violation = report['csp-report'];

    // Log to Sentry if available
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureMessage('CSP Violation', {
        level: 'warning',
        tags: {
          type: 'csp-violation',
          directive: violation['effective-directive'],
        },
        extra: {
          documentUri: violation['document-uri'],
          violatedDirective: violation['violated-directive'],
          blockedUri: violation['blocked-uri'],
          sourceFile: violation['source-file'],
          lineNumber: violation['line-number'],
        },
      });
    }

    // Also log for local development using logger
    if (process.env.NODE_ENV === 'development') {
      // Import dynamically to avoid server/client mismatch
      const { default: logger } = await import('@/utils/logger');
      logger.warn('[CSP Violation]', {
        directive: violation['effective-directive'],
        blockedUri: violation['blocked-uri'],
        sourceFile: violation['source-file'],
      });
    }

    return NextResponse.json({ received: true }, { status: 204 });
  } catch {
    // Invalid report format - silently accept to prevent retries
    return NextResponse.json({ received: true }, { status: 204 });
  }
}
