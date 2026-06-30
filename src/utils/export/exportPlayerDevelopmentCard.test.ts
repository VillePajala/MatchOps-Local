import { renderDevelopmentCard, isCardExportSupported, type DevelopmentCardData } from './exportPlayerDevelopmentCard';

const baseData = (overrides: Partial<DevelopmentCardData> = {}): DevelopmentCardData => ({
  playerName: 'Test Player',
  countLabel: '6 rated',
  max: 10,
  axes: [
    { label: 'Ball control', current: 7, baseline: 4 },
    { label: 'Passing', current: 5, baseline: 5 },
    { label: 'Scanning', current: 3, baseline: 2 },
    { label: 'Teamwork', current: 8, baseline: 6 },
  ],
  strengths: [{ label: 'Teamwork', arrow: '↑', color: '#34d399' }],
  focus: [{ label: 'Scanning', arrow: '→', color: '#94a3b8' }],
  labels: { title: 'Development report', now: 'Now', baseline: 'Season start', strengths: 'Strengths', focus: 'Focus areas' },
  ...overrides,
});

describe('exportPlayerDevelopmentCard', () => {
  it('renders a 640px-wide canvas with positive height', () => {
    const canvas = renderDevelopmentCard(baseData());
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBeGreaterThan(200);
  });

  it('renders a shorter card (no radar block) with fewer than 3 axes', () => {
    const tall = renderDevelopmentCard(baseData());
    const short = renderDevelopmentCard(baseData({ axes: [{ label: 'A', current: 5, baseline: 5 }] }));
    expect(short.height).toBeLessThan(tall.height);
  });

  it('reports export support in a canvas-capable environment', () => {
    expect(isCardExportSupported()).toBe(true);
  });
});
