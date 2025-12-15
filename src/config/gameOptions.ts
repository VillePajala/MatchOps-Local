export const AGE_GROUPS = Array.from({ length: 15 }, (_, i) => `U${i + 7}`);
export const LEVELS = ['Elite', 'Kilpa', 'Haaste', 'Harraste'];

/**
 * Coach certifications - Finnish Football Association (SPL) structure
 * Organized by discipline: Football, Futsal, Goalkeeper
 */
export interface CertificationGroup {
  labelKey: string;
  label: string; // Fallback label
  certifications: readonly string[];
}

export const CERTIFICATION_GROUPS: readonly CertificationGroup[] = [
  {
    labelKey: 'certifications.groups.football',
    label: 'Football Coaching',
    certifications: [
      'Futisvalmentajan startti',
      'Ikävaihekoulutus',
      'UEFA C',
      'UEFA B',
      'UEFA Youth B',
      'UEFA Elite Youth A',
      'UEFA A + VAT',
      'UEFA PRO',
    ],
  },
  {
    labelKey: 'certifications.groups.futsal',
    label: 'Futsal Coaching',
    certifications: ['Futsal C', 'UEFA Futsal B'],
  },
  {
    labelKey: 'certifications.groups.goalkeeper',
    label: 'Goalkeeper Coaching',
    certifications: ['Maalivahti D', 'Maalivahti C', 'UEFA GK B', 'UEFA GK A'],
  },
] as const;

// Flat array derived from groups for validation and backward compatibility
export const CERTIFICATIONS = CERTIFICATION_GROUPS.flatMap(g => g.certifications);

export type Certification = (typeof CERTIFICATION_GROUPS)[number]['certifications'][number];
