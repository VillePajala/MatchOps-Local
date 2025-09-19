/**
 * Next.js instrumentation file for registering monitoring and telemetry
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * This file is automatically loaded by Next.js to set up instrumentation
 * for both Node.js and Edge runtimes. It initializes Sentry error tracking
 * based on the runtime environment.
 */

/**
 * Registers instrumentation based on the runtime environment
 *
 * This function is called once when the Next.js server starts.
 * It conditionally loads Sentry configuration for either Node.js
 * or Edge runtime environments.
 *
 * @returns Promise that resolves when instrumentation is registered
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import server-side Sentry configuration for Node.js runtime
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Import Edge runtime Sentry configuration for Vercel Edge Functions
    await import('../sentry.edge.config');
  }
}

/**
 * Captures and reports server-side errors to Sentry
 *
 * This hook is called by Next.js whenever an unhandled error occurs
 * during server-side rendering, API routes, or server actions.
 *
 * @param err - The error that occurred
 * @param request - The incoming request that triggered the error
 * @param context - Additional context about where the error occurred
 * @param context.routerKind - Whether the error occurred in Pages or App Router
 * @param context.routePath - The route path where the error occurred
 * @param context.routeType - The type of operation that failed
 *
 * @example
 * // This function is called automatically by Next.js on server errors
 * // It captures context like:
 * // - Route: /api/users/[id]
 * // - Method: POST
 * // - Router: App Router
 * // - Type: route (API route handler)
 */
export async function onRequestError(
  err: Error,
  request: Request,
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
  }
) {
  // Import Sentry dynamically to avoid issues in environments where it's not initialized
  const Sentry = await import('@sentry/nextjs');

  Sentry.captureException(err, {
    tags: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    extra: {
      url: request.url,
      method: request.method,
    },
  });
}