import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameWrapUpCard from '../GameWrapUpCard';
import { computeGameCompleteness } from '@/utils/gameCompleteness';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const completeness = computeGameCompleteness({
  isPlayed: true,
  gameNotes: '',
  selectedPlayerIds: ['p1', 'p2'],
  seasonId: '',
  tournamentId: '',
  teamId: '',
  playerPositions: {},
  assessments: {},
});

describe('GameWrapUpCard - Kirjuri voice notes row', () => {
  it('offers the voice-notes row only while clips await review, routing to the inbox', () => {
    const onOpenVoiceNotes = jest.fn();
    const { rerender } = render(<GameWrapUpCard completeness={completeness} voiceClipCount={0} onOpenVoiceNotes={onOpenVoiceNotes} />);
    expect(screen.queryByText(/voice notes to review/)).not.toBeInTheDocument();

    rerender(<GameWrapUpCard completeness={completeness} voiceClipCount={3} onOpenVoiceNotes={onOpenVoiceNotes} />);
    fireEvent.click(screen.getByText('3 voice notes to review'));
    expect(onOpenVoiceNotes).toHaveBeenCalledTimes(1);
  });

  it('report and positions rows scroll within the page instead of leaving it', () => {
    const onOpenReport = jest.fn();
    const onOpenPositions = jest.fn();
    render(<GameWrapUpCard completeness={completeness} onOpenReport={onOpenReport} onOpenPositions={onOpenPositions} />);
    fireEvent.click(screen.getByText('Match report'));
    fireEvent.click(screen.getByText('Positions played'));
    expect(onOpenReport).toHaveBeenCalledTimes(1);
    expect(onOpenPositions).toHaveBeenCalledTimes(1);
  });

  it('does not call the game Complete while clips still wait', () => {
    const complete = computeGameCompleteness({
      isPlayed: true, gameNotes: 'Good game', selectedPlayerIds: ['p1'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {},
    });
    const { rerender } = render(<GameWrapUpCard completeness={complete} voiceClipCount={0} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    rerender(<GameWrapUpCard completeness={complete} voiceClipCount={1} />);
    expect(screen.getByText('Needs finishing')).toBeInTheDocument();
  });
});
