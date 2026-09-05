import type { Metadata } from 'next';
import HandsFreeSpike from './HandsFreeSpike';

/**
 * Kirjuri Phase 2 spike route. THROWAWAY - delete before this branch reaches
 * master. Kept out of search engines and out of the app's own navigation: the
 * only way here is typing the address.
 */
export const metadata: Metadata = {
  title: 'Kirjuri hands-free spike',
  robots: { index: false, follow: false },
};

export default function KirjuriSpikePage() {
  return <HandsFreeSpike />;
}
