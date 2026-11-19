/**
 * The setup wizard opens only for a truly empty, never-onboarded account whose
 * data has fully loaded (review R9). Opening it flips the account to the basic
 * layout, so a false "empty" here would change an existing coach's app.
 * @critical
 */
import { isSetupWizardEligible, type SetupWizardGateInput } from '../setupWizardGate';

const KEY = 'u1:0';
const empty = (over: Partial<SetupWizardGateInput> = {}): SetupWizardGateInput => ({
  checkKey: KEY,
  stateCheckedFor: KEY,
  setupSignalsCheckedFor: KEY,
  isFirstTimeUser: true,
  hasTeam: false,
  hasCompetition: false,
  accountWizardSeen: false,
  deviceWizardSeen: false,
  ...over,
});

describe('isSetupWizardEligible', () => {
  it('opens for a fully loaded, empty, new account', () => {
    expect(isSetupWizardEligible(empty())).toBe(true);
  });

  /** The race the review found: teams arrive after the games/players read. */
  it('waits for the teams read, not only the games/players read', () => {
    expect(isSetupWizardEligible(empty({ setupSignalsCheckedFor: null }))).toBe(false);
    expect(isSetupWizardEligible(empty({ setupSignalsCheckedFor: 'u1:-1' }))).toBe(false);
    expect(isSetupWizardEligible(empty({ stateCheckedFor: 'u0:0' }))).toBe(false);
  });

  it('never opens for an account that holds anything', () => {
    expect(isSetupWizardEligible(empty({ isFirstTimeUser: false }))).toBe(false);
    expect(isSetupWizardEligible(empty({ hasTeam: true }))).toBe(false);
    expect(isSetupWizardEligible(empty({ hasCompetition: true }))).toBe(false);
  });

  it('never opens again once the ACCOUNT has seen it, on any device', () => {
    expect(isSetupWizardEligible(empty({ accountWizardSeen: true }))).toBe(false);
    expect(isSetupWizardEligible(empty({ deviceWizardSeen: true }))).toBe(false);
  });
});
