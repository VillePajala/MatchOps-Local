import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerBar from './PlayerBar';
import { Player } from '@/types';
import { GameEvent } from '@/types';

// Mock next/image since it's used in the component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ComponentProps<'img'>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} src={props.src || ''} alt={props.alt || ''} />;
  },
}));

describe('PlayerBar', () => {
  // Sample player data similar to what masterRoster utility would provide
  const mockPlayers: Player[] = [
    { id: 'player1', name: 'John Doe', nickname: 'John', color: '#FF0000', isGoalie: false },
    { id: 'player2', name: 'Jane Smith', nickname: 'Jane', color: '#00FF00', isGoalie: true },
    { id: 'player3', name: 'Bob Johnson', nickname: 'Bob', color: '#0000FF', isGoalie: false },
  ];

  const mockGameEvents: GameEvent[] = [
    { id: 'goal1', type: 'goal', time: 300, scorerId: 'player1', assisterId: 'player3' },
    { id: 'goal2', type: 'opponentGoal', time: 600 },
  ];

  const defaultProps = {
    players: mockPlayers,
    gameEvents: mockGameEvents,
    onPlayerDragStartFromBar: jest.fn(),
    selectedPlayerIdFromBar: null,
    onBarBackgroundClick: jest.fn(),
    onPlayerTapInBar: jest.fn(),
    onToggleGoalie: jest.fn(),
  };

  it('renders the component with player disks', () => {
    render(<PlayerBar {...defaultProps} />);
    
    // Check if each player's nickname is displayed
    mockPlayers.forEach(player => {
      expect(screen.getByText(player.nickname!)).toBeInTheDocument();
    });
  });

  it('calls onBarBackgroundClick when clicking background', () => {
    render(<PlayerBar {...defaultProps} />);

    // Find and click on the background (the main container)
    const background = screen.getByTestId('player-bar');
    fireEvent.click(background);
    expect(defaultProps.onBarBackgroundClick).toHaveBeenCalled();
  });

  it('handles player selection in the bar', () => {
    render(<PlayerBar {...defaultProps} />);
    
    // Find John's player disk and click it
    const johnDisk = screen.getByText('John').closest('div');
    if (johnDisk) {
      fireEvent.mouseDown(johnDisk);
      expect(defaultProps.onPlayerTapInBar).toHaveBeenCalledWith(expect.objectContaining({
        id: 'player1',
        name: 'John Doe',
      }));
    }
  });

  it('indicates goalies correctly', () => {
    render(<PlayerBar {...defaultProps} />);
    
    // PePo preview: the goalie (Jane) is PePo yellow (gradient) inside a
    // club-violet ring - not the default violet disc.
    const janeDisk = screen.getByText('Jane').closest('div');
    expect(janeDisk).toBeInTheDocument();
    const janeStyle = janeDisk!.getAttribute('style') ?? '';
    expect(janeStyle).toMatch(/radial-gradient/);
    expect(janeStyle).toMatch(/#fadd15|rgb\(250, 221, 21\)/i);
    expect(janeStyle).toMatch(/inset 0 0 0 3px (#822174|rgb\(130, 33, 116\))/i);

    // Optionally, check a non-goalie's color
    const johnDisk = screen.getByText('John').closest('div');
    expect(johnDisk).toBeInTheDocument();
    // John's color is #FF0000 (red)
    expect(johnDisk).toHaveStyle('background-color: #FF0000'); 
  });

  describe('bench players are drawn hollow, never dimmed', () => {
    const squad: Player[] = [
      { id: 'on', name: 'Onni Field', nickname: 'Onni' },
      { id: 'bench', name: 'Roope Bench', nickname: 'Roope' },
      { id: 'kit', name: 'Kalle Kit', nickname: 'Kalle', color: '#FF0000' },
      { id: 'gk', name: 'Jasper Keeper', nickname: 'Jasper', isGoalie: true },
    ];
    const disc = (name: string) => screen.getByText(name).parentElement as HTMLElement;
    const renderSquad = (selected: string | null = null) =>
      render(
        <PlayerBar
          {...defaultProps}
          players={squad}
          gameEvents={[]}
          selectedPlayerIdFromBar={selected}
          onFieldPlayerIds={new Set(['on'])}
        />,
      );

    it('draws a player on the pitch solid and a bench player hollow with a light ring', () => {
      renderSquad();

      const onPitch = disc('Onni');
      expect(onPitch).not.toHaveAttribute('data-bench');
      expect(onPitch.getAttribute('style') ?? '').toMatch(/radial-gradient/);

      const bench = disc('Roope');
      expect(bench).toHaveAttribute('data-bench', 'true');
      expect(bench).toHaveStyle('background: rgb(255 255 255 / 0.05)');
      expect(bench.getAttribute('style') ?? '').toMatch(/inset 0 0 0 2px rgb\(229 233 240 \/ 0\.6\)/);
      expect(screen.getByText('Roope')).toHaveClass('text-[#e5e9f0]');
    });

    it('never dims a disc', () => {
      renderSquad();
      for (const name of ['Onni', 'Roope', 'Kalle', 'Jasper']) {
        expect(disc(name).style.opacity).toBe('');
      }
    });

    it("keeps a bench player's kit colour as the hollow ring", () => {
      renderSquad();
      const kit = disc('Kalle');
      expect(kit).toHaveAttribute('data-bench', 'true');
      expect(kit.getAttribute('style') ?? '').toMatch(/inset 0 0 0 2px (#FF0000|rgb\(255, 0, 0\))/i);
    });

    it('keeps the keeper styling on the bench', () => {
      renderSquad();
      const gk = disc('Jasper');
      const style = gk.getAttribute('style') ?? '';
      expect(style).toMatch(/radial-gradient/);
      expect(style).toMatch(/inset 0 0 0 3px (#822174|rgb\(130, 33, 116\))/i);
    });

    it('shows a selected bench player with the amber ring, still hollow', () => {
      renderSquad('bench');
      const bench = disc('Roope');
      const style = bench.getAttribute('style') ?? '';
      expect(style).toMatch(/var\(--color-action\)/);
      expect(style).toMatch(/inset 0 0 0 2px rgb\(229 233 240 \/ 0\.6\)/);
      expect(bench).toHaveStyle('background: rgb(255 255 255 / 0.05)');
    });

    it('draws every disc solid when the pitch is not known', () => {
      render(<PlayerBar {...defaultProps} players={squad} gameEvents={[]} />);
      expect(disc('Roope')).not.toHaveAttribute('data-bench');
    });
  });
});
