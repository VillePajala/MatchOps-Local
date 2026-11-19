/**
 * When the first-sign-in setup wizard may open (review R9) - pure, so the rule
 * page.tsx applies is tested on its own.
 *
 * Opening the wizard is not harmless: it marks the account as new, which gives
 * it the basic layout. An existing account must therefore never get there, and
 * "the account is empty" may only be concluded from reads that have all
 * finished for the current account and refresh:
 *   - games and players (the main state check), AND
 *   - teams and competitions (a second, slower read that used to be ignored -
 *     an account with a team but no players or games looked empty), AND
 *   - the account's own record that it has never seen the wizard (the synced
 *     `wizardDone` / `wizardSkipped` milestones), besides this device's flag.
 */
export interface SetupWizardGateInput {
  /** The (account, refresh) key the current reads belong to. */
  checkKey: string;
  /** The key the games/players read last finished for. */
  stateCheckedFor: string | null;
  /** The key the teams/competitions read last SUCCEEDED for. */
  setupSignalsCheckedFor: string | null;
  /** No players, no games, nothing still arriving from the cloud. */
  isFirstTimeUser: boolean;
  hasTeam: boolean;
  hasCompetition: boolean;
  /** The account's settings say the wizard was finished or skipped. */
  accountWizardSeen: boolean;
  /** This device's flag (or a session dismissal) says so. */
  deviceWizardSeen: boolean;
}

export function isSetupWizardEligible(input: SetupWizardGateInput): boolean {
  return (
    input.stateCheckedFor === input.checkKey &&
    input.setupSignalsCheckedFor === input.checkKey &&
    input.isFirstTimeUser &&
    !input.hasTeam &&
    !input.hasCompetition &&
    !input.accountWizardSeen &&
    !input.deviceWizardSeen
  );
}
