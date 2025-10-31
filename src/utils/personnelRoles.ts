/**
 * Personnel role label translation keys
 *
 * @remarks
 * Centralized role keys for consistent i18n across components
 */
export const PERSONNEL_ROLE_LABEL_KEYS = {
  head_coach: 'personnel.roles.headCoach',
  assistant_coach: 'personnel.roles.assistantCoach',
  goalkeeper_coach: 'personnel.roles.goalkeeperCoach',
  fitness_coach: 'personnel.roles.fitnessCoach',
  physio: 'personnel.roles.physio',
  team_manager: 'personnel.roles.teamManager',
  support_staff: 'personnel.roles.supportStaff',
  other: 'personnel.roles.other',
} as const;

export type PersonnelRoleKey = keyof typeof PERSONNEL_ROLE_LABEL_KEYS;

/**
 * Get translation key for personnel role
 */
export function getRoleLabelKey(role: PersonnelRoleKey): string {
  return PERSONNEL_ROLE_LABEL_KEYS[role];
}
