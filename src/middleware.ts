import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Generate a unique nonce for each request using Web Crypto API (Edge Runtime compatible)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode.apply(null, Array.from(array)));
  
  // Validate nonce generation
  if (!nonce || nonce.length < 16) {
    throw new Error('CSP nonce generation failed');
  }
  
  // Clone the request headers and add the nonce
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-csp-nonce', nonce);
  
  // Get the response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Only apply CSP in production
  if (process.env.NODE_ENV === 'production') {
    // Replace the nonce placeholder in CSP header
    const cspHeader = response.headers.get('Content-Security-Policy');
    if (cspHeader) {
      const updatedCSP = cspHeader.replace(/__CSP_NONCE__/g, nonce);
      response.headers.set('Content-Security-Policy', updatedCSP);
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js (service worker)
     * - manifest.json (PWA manifest)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)',
  ],
};