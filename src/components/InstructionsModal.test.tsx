import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import InstructionsModal from './InstructionsModal';

const renderModal = (isOpen = true) =>
  render(
    <I18nextProvider i18n={i18n}>
      <InstructionsModal isOpen={isOpen} onClose={jest.fn()} />
    </I18nextProvider>,
  );

describe('InstructionsModal ("How it works", two-level rebuild)', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the Home club-hub section describing the four tabs + gear', () => {
    renderModal();
    expect(screen.getByText(i18n.t('appGuide.homeTitle', 'Home — your club hub'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeGamesTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeTeamTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeCompetitionsTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeStatsTab'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.homeGear'))).toBeInTheDocument();
  });

  it('keeps the Match Mode field sections and the slim match menu', () => {
    renderModal();
    expect(screen.getByText(i18n.t('firstGameGuide.playerSelection'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('appGuide.matchMenuTitle', 'The match menu'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('firstGameGuide.backHomeTip'))).toBeInTheDocument();
  });

  it('no longer describes the old single-screen "open the Menu" model', () => {
    renderModal();
    // The retired sections' headings must be gone.
    expect(screen.queryByText(i18n.t('firstGameGuide.otherFeatures', 'Other Features'))).not.toBeInTheDocument();
    expect(screen.queryByText('Using the menu')).not.toBeInTheDocument();
  });
});
