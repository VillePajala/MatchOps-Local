import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerDevelopmentRadar, { type RadarAxis } from './PlayerDevelopmentRadar';

const axes: RadarAxis[] = [
  { key: 'ball_control', label: 'Ball control', current: 7, baseline: 4 },
  { key: 'passing', label: 'Passing', current: 5, baseline: 5 },
  { key: 'scanning', label: 'Scanning', current: 3, baseline: 2 },
];

describe('PlayerDevelopmentRadar', () => {
  it('renders both polygons, axis labels, and the legend', () => {
    const { container } = render(
      <PlayerDevelopmentRadar axes={axes} max={10} currentLabel="Now" baselineLabel="Season start" />
    );
    // current + baseline polygons, plus 4 grid rings = 6 polygons
    expect(container.querySelectorAll('polygon').length).toBe(6);
    expect(screen.getByText('Ball control')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Season start')).toBeInTheDocument();
  });

  it('renders nothing with fewer than 3 axes', () => {
    const { container } = render(
      <PlayerDevelopmentRadar axes={axes.slice(0, 2)} max={10} currentLabel="Now" baselineLabel="Season start" />
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
