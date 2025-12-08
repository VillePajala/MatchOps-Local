import type { Metadata } from 'next';
import { PrivacyPolicyClient } from './PrivacyPolicyClient';

export const metadata: Metadata = {
  title: 'Privacy Policy - MatchOps',
  description:
    'Privacy Policy for MatchOps soccer coaching app. Learn how we handle your data with our local-first approach.',
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyClient />;
}
