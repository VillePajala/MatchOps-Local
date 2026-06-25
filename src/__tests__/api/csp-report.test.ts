/**
 * Tests for the CSP violation report endpoint.
 * @integration
 *
 * Exercises POST directly with both browser payload shapes:
 * - Legacy `report-uri`: { "csp-report": { "effective-directive": ... } }
 * - Modern Reporting API (`report-to`): [ { type, body: { effectiveDirective, ... } } ]
 *
 * Regression (finding L3): modern reports used to throw on parse and be silently
 * dropped (never logged to Sentry).
 */

import * as Sentry from '@sentry/nextjs';

jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
}));

// Lightweight NextResponse stand-in so we can read the status without the Next runtime.
jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
  },
}));

// Imported after the mocks above are registered.
import { POST } from '@/app/api/csp-report/route';

type RouteResponse = { status: number };

const makeRequest = (body: string) =>
  ({ text: async () => body } as unknown as Request);

const captureMessage = Sentry.captureMessage as jest.Mock;

describe('CSP Report Endpoint', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://test@sentry.example/1';
  });

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    }
  });

  it('logs a legacy report-uri violation to Sentry', async () => {
    const payload = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://app.example/page',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.example/x.js',
        'source-file': 'https://app.example/page',
        'line-number': 42,
      },
    });

    const res = (await POST(makeRequest(payload) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'CSP Violation',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ type: 'csp-violation', directive: 'script-src' }),
        extra: expect.objectContaining({
          blockedUri: 'https://evil.example/x.js',
          sourceFile: 'https://app.example/page',
          lineNumber: 42,
        }),
      }),
    );
  });

  it('logs a modern Reporting API violation to Sentry (previously dropped)', async () => {
    const payload = JSON.stringify([
      {
        type: 'csp-violation',
        age: 10,
        url: 'https://app.example/page',
        body: {
          documentURL: 'https://app.example/page',
          violatedDirective: 'img-src',
          effectiveDirective: 'img-src',
          blockedURL: 'https://evil.example/pixel.png',
          sourceFile: 'https://app.example/page',
          lineNumber: 7,
        },
      },
    ]);

    const res = (await POST(makeRequest(payload) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'CSP Violation',
      expect.objectContaining({
        tags: expect.objectContaining({ directive: 'img-src' }),
        extra: expect.objectContaining({
          documentUri: 'https://app.example/page',
          blockedUri: 'https://evil.example/pixel.png',
          lineNumber: 7,
        }),
      }),
    );
  });

  it('logs every report in a batched modern array', async () => {
    const payload = JSON.stringify([
      { type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'a' } },
      { type: 'csp-violation', body: { effectiveDirective: 'style-src', blockedURL: 'b' } },
    ]);

    const res = (await POST(makeRequest(payload) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('ignores non-csp-violation entries in a modern array', async () => {
    const payload = JSON.stringify([
      { type: 'deprecation', body: { id: 'x' } },
    ]);

    const res = (await POST(makeRequest(payload) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('accepts an unrecognized shape without logging (204, no Sentry)', async () => {
    const res = (await POST(makeRequest(JSON.stringify({ foo: 'bar' })) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('returns 204 on invalid JSON', async () => {
    const res = (await POST(makeRequest('not json{') as never)) as unknown as RouteResponse;

    expect(res.status).toBe(204);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('rejects an oversized payload with 413', async () => {
    const huge = 'x'.repeat(10001);
    const res = (await POST(makeRequest(huge) as never)) as unknown as RouteResponse;

    expect(res.status).toBe(413);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
