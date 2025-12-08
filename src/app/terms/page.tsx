import type { Metadata } from 'next';
import { TermsOfServiceClient } from './TermsOfServiceClient';

export const metadata: Metadata = {
  title: 'Terms of Service - MatchOps',
  description:
    'Terms of Service for MatchOps soccer coaching app. Understand the terms and conditions for using our app.',
};

export default function TermsOfServicePage() {
  return <TermsOfServiceClient />;
}
