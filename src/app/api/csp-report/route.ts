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

/**
 * A CSP violation normalized across the two browser payload formats:
 * - Legacy `report-uri`: `{ "csp-report": { "effective-directive": ... } }` (kebab-case)
 * - Modern Reporting API (`report-to`): a JSON array of `{ type, body: { effectiveDirective, ... } }`
 *   objects (camelCase). next.config.ts emits both header families, so the endpoint
 *   must accept both shapes — otherwise modern (Chromium) reports throw on parse and
 *   are silently dropped.
 */
type NormalizedViolation = {
  effectiveDirective?: string;
  violatedDirective?: string;
  documentUri?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
};

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Legacy `report-uri` body (the value under the "csp-report" key). */
function fromLegacy(report: Record<string, unknown>): NormalizedViolation {
  return {
    effectiveDirective: asString(report['effective-directive']),
    violatedDirective: asString(report['violated-directive']),
    documentUri: asString(report['document-uri']),
    blockedUri: asString(report['blocked-uri']),
    sourceFile: asString(report['source-file']),
    lineNumber: asNumber(report['line-number']),
  };
}

/** Modern Reporting API report `body` (camelCase keys). */
function fromModern(body: Record<string, unknown>): NormalizedViolation {
  return {
    effectiveDirective: asString(body['effectiveDirective']),
    violatedDirective: asString(body['violatedDirective']),
    documentUri: asString(body['documentURL']),
    blockedUri: asString(body['blockedURL']),
    sourceFile: asString(body['sourceFile']),
    lineNumber: asNumber(body['lineNumber']),
  };
}

/** Extract zero or more normalized violations from either payload shape. */
function extractViolations(parsed: unknown): NormalizedViolation[] {
  // Modern Reporting API: an array of report objects (may batch several).
  if (Array.isArray(parsed)) {
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .filter((entry) => entry['type'] === undefined || entry['type'] === 'csp-violation')
      .map((entry) => {
        const body = entry['body'];
        return fromModern(body && typeof body === 'object' ? (body as Record<string, unknown>) : {});
      });
  }
  // Legacy report-uri: { "csp-report": {...} }
  if (parsed && typeof parsed === 'object') {
    const legacy = (parsed as Record<string, unknown>)['csp-report'];
    if (legacy && typeof legacy === 'object') {
      return [fromLegacy(legacy as Record<string, unknown>)];
    }
  }
  return [];
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
    const parsed: unknown = JSON.parse(bodyText);
    const violations = extractViolations(parsed);

    // Dynamically import the dev logger once (avoids server/client mismatch).
    const devLogger = process.env.NODE_ENV === 'development'
      ? (await import('@/utils/logger')).default
      : null;

    for (const violation of violations) {
      // Log to Sentry if available
      // Wrapped in try/catch to prevent Sentry SDK failures from affecting API response
      if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        try {
          Sentry.captureMessage('CSP Violation', {
            level: 'warning',
            tags: {
              type: 'csp-violation',
              directive: violation.effectiveDirective,
            },
            extra: {
              documentUri: violation.documentUri,
              violatedDirective: violation.violatedDirective,
              blockedUri: violation.blockedUri,
              sourceFile: violation.sourceFile,
              lineNumber: violation.lineNumber,
            },
          });
        } catch {
          // Sentry failure must not affect CSP report handling
        }
      }

      // Also log for local development
      devLogger?.warn('[CSP Violation]', {
        directive: violation.effectiveDirective,
        blockedUri: violation.blockedUri,
        sourceFile: violation.sourceFile,
      });
    }

    // 204 No Content - CSP reports don't expect a response body
    return new NextResponse(null, { status: 204 });
  } catch {
    // Invalid report format - silently accept to prevent retries
    return new NextResponse(null, { status: 204 });
  }
}
