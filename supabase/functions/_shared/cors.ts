/**
 * Shared CORS utilities for Supabase Edge Functions
 *
 * This module contains reusable CORS configuration and validation
 * logic shared between multiple edge functions.
 */

// Allowed origins for CORS (exact match)
export const ALLOWED_ORIGINS = [
  'https://matchops.app',
  'https://www.matchops.app',
  'https://match-ops-local.vercel.app',
  // Allow localhost for development (ports 3000-3009)
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:3008',
  'http://localhost:3009',
];

// Vercel preview deployment pattern: match-ops-local-*.vercel.app
// Security note: This only matches our specific project prefix (match-ops-local).
// Vercel generates unique subdomains per deployment (e.g., match-ops-local-abc123.vercel.app).
// An attacker would need access to our Vercel project to create a matching deployment.
export const VERCEL_PREVIEW_PATTERN = /^https:\/\/match-ops-local(-[a-z0-9-]+)?\.vercel\.app$/;

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  return false;
}

/**
 * Get CORS headers with origin validation
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Use request origin if allowed, otherwise default to production
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
