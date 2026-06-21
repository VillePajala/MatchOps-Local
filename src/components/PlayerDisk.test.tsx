import React from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerDisk from './PlayerDisk';

const baseProps = {
  id: 'p1',
  fullName: 'John Doe',
  nickname: 'John',
  gameEvents: [],
  // Selected so the goalie toggle button is rendered.
  selectedPlayerIdFromBar: 'p1',
};

describe('PlayerDisk goalie toggle', () => {
  it('prevents default on touchEnd so the synthetic click does not double-fire the toggle', () => {
    const onToggleGoalie = jest.fn();
    render(<PlayerDisk {...baseProps} onToggleGoalie={onToggleGoalie} />);

    const toggleButton = screen.getByTitle('Set Goalie');

    // On touch devices a touchEnd is followed by a synthetic click. Without
    // preventDefault both fire and the toggle cancels itself out. The handler
    // must call preventDefault on the touchEnd to suppress the trailing click.
    const touchEnd = createEvent.touchEnd(toggleButton);
    fireEvent(toggleButton, touchEnd);

    expect(touchEnd.defaultPrevented).toBe(true);
    expect(onToggleGoalie).toHaveBeenCalledTimes(1);
    expect(onToggleGoalie).toHaveBeenCalledWith('p1');
  });

  it('toggles goalie on a plain click', () => {
    const onToggleGoalie = jest.fn();
    render(<PlayerDisk {...baseProps} onToggleGoalie={onToggleGoalie} />);

    fireEvent.click(screen.getByTitle('Set Goalie'));

    expect(onToggleGoalie).toHaveBeenCalledTimes(1);
    expect(onToggleGoalie).toHaveBeenCalledWith('p1');
  });
});
