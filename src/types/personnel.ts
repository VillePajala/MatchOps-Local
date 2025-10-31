/**
 * Personnel member (coach, trainer, manager, etc.)
 *
 * @remarks
 * Personnel are stored globally (not team-specific) to allow coaches
 * to work with multiple teams without duplication.
 */
export interface Personnel {
  id: string;                          // personnel_<timestamp>_<uuid>
  name: string;                        // Full name
  role: PersonnelRole;                 // Primary role
  phone?: string;                      // Contact number (optional)
  email?: string;                      // Email address (optional)
  certifications?: string[];           // e.g., ["UEFA A License", "First Aid"]
  notes?: string;                      // General notes
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}

/**
 * Available personnel roles
 */
export type PersonnelRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'goalkeeper_coach'
  | 'fitness_coach'
  | 'physio'
  | 'team_manager'
  | 'support_staff'
  | 'other';

/**
 * Personnel collection stored in IndexedDB
 */
export interface PersonnelCollection {
  [personnelId: string]: Personnel;
}
