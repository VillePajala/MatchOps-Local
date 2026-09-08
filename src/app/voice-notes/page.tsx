import type { Metadata } from 'next';
import { VoiceNotesInfoClient } from './VoiceNotesInfoClient';

export const metadata: Metadata = {
  title: 'What leaves the phone - MatchOps',
  description:
    'For families: how a coach\'s voice notes and the optional AI features in MatchOps handle data about players.',
};

/**
 * The page a coach can send to parents. Everything on it is a claim about the
 * shipped code, kept in step with the consent gate and the privacy policy.
 */
export default function VoiceNotesInfoPage() {
  return <VoiceNotesInfoClient />;
}
