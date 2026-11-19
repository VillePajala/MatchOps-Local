import React from 'react';
import { render, screen } from '../../../../tests/utils/test-utils';
import { TeamPerformanceCard } from './TeamPerformanceCard';

/**
 * Review 5.2: the record reads wins-draws-losses, labelled, as on Home and in the
 * opponent table (it was wins-losses-draws, so 4-2-1 on Home read 4-1-2 here).
 * @critical
 */
describe('TeamPerformanceCard record', () => {
  it('shows wins-draws-losses with the order in the label', () => {
    render(
      <TeamPerformanceCard
        title="Season"
        gamesPlayed={7}
        wins={4}
        ties={2}
        losses={1}
        winPercentage={57.1}
        goalDifference={5}
        goalsFor={12}
        goalsAgainst={7}
        averageGoalsFor={1.7}
        averageGoalsAgainst={1}
      />,
    );
    expect(screen.getByText('4-2-1')).toBeInTheDocument();
    // Hyphens are non-breaking (U+2011) so the label never wraps inside "(W-D-L)".
    expect(screen.getByText(/Record \(W\u2011D\u2011L\)/)).toBeInTheDocument();
  });
});
