import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import InstructionsModal from './InstructionsModal';

let mockLayout: 'basic' | 'full' | undefined = 'full';
jest.mock('@/hooks/useAppLayout', () => ({ useAppLayout: () => mockLayout }));

const renderModal = (isOpen = true) =>
  render(
    <I18nextProvider i18n={i18n}>
      <InstructionsModal isOpen={isOpen} onClose={jest.fn()} />
    </I18nextProvider>,
  );

/** Sections start collapsed (titles only); tap a title to read it. */
const expand = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }));

describe('InstructionsModal ("How it works", two-level rebuild)', () => {
  beforeEach(() => { mockLayout = 'full'; });

  it('basic layout: describes the basic Home, not the four tabs or tip2', () => {
    mockLayout = 'basic';
    renderModal();
    expand(i18n.t('appGuide.homeTitle', 'Home — your club hub'));
    expect(screen.getByText(i18n.t('appGuide.homeBasicNextGame'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeBasicTeam'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('appGuide.homeGamesTab'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('appGuide.homeStatsTab'))).not.toBeInTheDocument();
    expand(i18n.t('instructionsModal.tips.title'));
    expect(screen.queryByText(i18n.t('instructionsModal.tips.tip2'))).not.toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = renderModal(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the section titles until one is tapped', () => {
    renderModal();
    const title = i18n.t('appGuide.homeTitle', 'Home — your club hub');
    const header = screen.getByRole('button', { name: title });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(i18n.t('appGuide.homeGamesTab'))).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(i18n.t('appGuide.homeGamesTab'))).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByText(i18n.t('appGuide.homeGamesTab'))).not.toBeInTheDocument();
  });

  it('leads with the Home club-hub section describing the four tabs + gear', () => {
    renderModal();
    expand(i18n.t('appGuide.homeTitle', 'Home — your club hub'));
    expect(screen.getByText(i18n.t('appGuide.homeTitle', 'Home — your club hub'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeGamesTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeTeamTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeCompetitionsTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeStatsTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeGear'))).toBeInTheDocument();
  });

  it('keeps the Match Mode field sections and the slim match menu', () => {
    renderModal();
    expect(screen.getByText(i18n.t('firstGameGuide.fieldTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.matchMenuTitle', 'The match menu'))).toBeInTheDocument();
    expand(i18n.t('appGuide.matchMenuTitle', 'The match menu'));
    expect(screen.getByText(i18n.t('firstGameGuide.backHomeTip'))).toBeInTheDocument();
  });

  it('no longer describes the old single-screen "open the Menu" model', () => {
    renderModal();
    // The retired sections' headings must be gone.
    expect(screen.queryByText(i18n.t('firstGameGuide.otherFeatures', 'Other Features'))).not.toBeInTheDocument();
    expect(screen.queryByText('Using the menu')).not.toBeInTheDocument();
  });

  it('describes select-and-place, quick goals and finishing, without tour or drag wording', () => {
    renderModal();
    expand(i18n.t('firstGameGuide.fieldTitle'));
    expect(screen.getByText(i18n.t('firstGameGuide.fieldPlace'))).toBeInTheDocument();
    expand(i18n.t('firstGameGuide.clockTitle'));
    expect(screen.getByText(i18n.t('firstGameGuide.clockGoal'))).toBeInTheDocument();
    expand(i18n.t('firstGameGuide.finishTitle'));
    expect(screen.getByText(i18n.t('firstGameGuide.finishReport'))).toBeInTheDocument();
    expect(screen.queryByText(/drag|raaha/i)).not.toBeInTheDocument();
  });
});
