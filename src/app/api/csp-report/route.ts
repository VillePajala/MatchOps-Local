import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/logger';

interface CSPReport {
  'csp-report': {
    'document-uri': string;
    'blocked-uri': string;
    'violated-directive': string;
    'original-policy': string;
    referrer?: string;
    'script-sample'?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const report: CSPReport = await request.json();
    const cspReport = report['csp-report'];
    
    if (!cspReport) {
      return NextResponse.json({ error: 'Invalid CSP report format' }, { status: 400 });
    }
    
    // Log CSP violations for security monitoring
    logger.warn('CSP Violation Detected', {
      component: 'CSP',
      section: 'security',
    }, {
      documentUri: cspReport['document-uri'],
      blockedUri: cspReport['blocked-uri'],
      violatedDirective: cspReport['violated-directive'],
      originalPolicy: cspReport['original-policy'],
      referrer: cspReport.referrer,
      scriptSample: cspReport['script-sample'],
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
    
    // In development, also log to console for immediate visibility
    if (process.env.NODE_ENV === 'development') {
      console.warn('🚨 CSP Violation:', {
        blocked: cspReport['blocked-uri'],
        directive: cspReport['violated-directive'],
        document: cspReport['document-uri'],
      });
    }
    
    return NextResponse.json({ status: 'received' });
  } catch (error) {
    logger.error('Failed to process CSP report', error as Error, {
      component: 'CSP',
      section: 'security',
    });
    
    return NextResponse.json({ error: 'Failed to process report' }, { status: 500 });
  }
}

// Handle GET requests (some browsers send GET instead of POST)
export async function GET() {
  return NextResponse.json({ message: 'CSP report endpoint is active' });
}