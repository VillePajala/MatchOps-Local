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
  // Reject oversized payloads to prevent abuse (CSP reports should be small).
  // Read body as text first to enforce limit even without Content-Length header.
  const MAX_BODY_SIZE = 10000;
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (bodyText.length > MAX_BODY_SIZE) {
    return new NextResponse(null, { status: 413 });
  }

  try {
    const report: CSPViolationReport = JSON.parse(bodyText);
    const violation = report['csp-report'];

    // Log to Sentry if available
    // Wrapped in try/catch to prevent Sentry SDK failures from affecting API response
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      try {
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
      } catch {
        // Sentry failure must not affect CSP report handling
      }
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

    // 204 No Content - CSP reports don't expect a response body
    return new NextResponse(null, { status: 204 });
  } catch {
    // Invalid report format - silently accept to prevent retries
    return new NextResponse(null, { status: 204 });
  }
}
