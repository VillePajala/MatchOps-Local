/**
 * Review 8.8: the "cannot delete" dialog said "Tämä sarja on used by 7 games and
 * 1 team." and hinted "toiseen joukkuen" - the reason was English and the hint a
 * suffix glued onto the type word.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import DeleteBlockedDialog from '../DeleteBlockedDialog';
import type { EntityReferences } from '@/interfaces/DataStore';

const refs: EntityReferences = {
  canDelete: false,
  counts: { games: 7, teams: 1, adjustments: 0 },
  summary: 'Used by 7 games and 1 team',
};

const renderDialog = (entityType: 'season' | 'tournament' | 'team', references = refs) =>
  render(
    <I18nextProvider i18n={i18n}>
      <DeleteBlockedDialog
        isOpen
        onClose={jest.fn()}
        entityType={entityType}
        entityName="Kevät"
        references={references}
        onArchive={jest.fn()}
      />
    </I18nextProvider>,
  );

describe('DeleteBlockedDialog language', () => {
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('English: the reason is built from the counts', () => {
    renderDialog('season');
    expect(screen.getByText('This league is used by 7 games and 1 team.')).toBeInTheDocument();
  });

  it('Finnish: the reason and the hint are whole Finnish sentences', async () => {
    await act(async () => { await i18n.changeLanguage('fi'); });
    renderDialog('team', { ...refs, counts: { games: 1, teams: 0, adjustments: 2 } });
    expect(screen.getByText('Tämä joukkue on käytössä: 1 ottelu ja 2 tilastokorjausta (niiden linkitys poistetaan).')).toBeInTheDocument();
    expect(screen.getByText(/toiseen joukkueeseen tai poista ne/)).toBeInTheDocument();
    expect(screen.queryByText(/used by|Used by/)).not.toBeInTheDocument();
  });

  it('falls back to the store summary when no known reference is counted', () => {
    renderDialog('season', { ...refs, counts: {}, summary: 'Used by 2 widgets' });
    expect(screen.getByText('Used by 2 widgets')).toBeInTheDocument();
  });
});
