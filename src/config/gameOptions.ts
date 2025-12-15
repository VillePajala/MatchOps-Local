export const AGE_GROUPS = Array.from({ length: 15 }, (_, i) => `U${i + 7}`);
export const LEVELS = ['Elite', 'Kilpa', 'Haaste', 'Harraste'];

/**
 * Coach certifications - Finnish Football Association (SPL) structure
 * Organized by discipline: Football, Futsal, Goalkeeper
 */
export const CERTIFICATIONS = [
  // Football coaching certifications
  'Futisvalmentajan startti',
  'Ikävaihekoulutus',
  'UEFA C',
  'UEFA B',
  'UEFA Youth B',
  'UEFA Elite Youth A',
  'UEFA A + VAT',
  'UEFA PRO',
  // Futsal coaching certifications
  'Futsal C',
  'UEFA Futsal B',
  // Goalkeeper coaching certifications
  'Maalivahti D',
  'Maalivahti C',
  'UEFA GK B',
  'UEFA GK A',
] as const;

export type Certification = typeof CERTIFICATIONS[number];
