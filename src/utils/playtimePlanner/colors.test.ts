import { fairnessHue, fairnessFill, fairnessText, fairnessCell, fairnessColor } from './colors';

describe('fairness colour ramp', () => {
  it('maps the clamped ratio range onto red→green hues (0..130), no blue ever', () => {
    expect(fairnessHue(0.4)).toBe(0); // deep under-played = red
    expect(fairnessHue(0)).toBe(0); // clamped low
    expect(fairnessHue(1.5)).toBe(130); // cap = green
    expect(fairnessHue(3)).toBe(130); // over-played stays green (no blue band)
    // Midpoint lands in the yellow region - a steady passage, not discrete bands.
    const mid = fairnessHue(0.95)!;
    expect(mid).toBeGreaterThan(55);
    expect(mid).toBeLessThan(75);
    // Monotonic: more minutes never reads "worse".
    expect(fairnessHue(1.2)!).toBeGreaterThan(fairnessHue(1.0)!);
  });

  it('returns null hue and neutral colours when there is no signal', () => {
    expect(fairnessHue(null)).toBeNull();
    expect(fairnessHue(NaN)).toBeNull();
    expect(fairnessFill(null)).toBe('#4a2850');
    expect(fairnessText(null)).toBe('#b79ab9');
    expect(fairnessCell(null)).toBe('#4a2850');
  });

  it('uses ONE muted colour for the pitch, the totals chips and the balance stripe', () => {
    for (const r of [0.4, 0.95, 1.5, null]) {
      expect(fairnessFill(r)).toBe(fairnessColor(r));
      expect(fairnessCell(r)).toBe(fairnessColor(r));
    }
  });

  it('emits hsl() strings on the ramp', () => {
    expect(fairnessColor(0.4)).toBe('hsl(0, 42%, 38%)');
    expect(fairnessColor(1.5)).toBe('hsl(130, 42%, 38%)');
    expect(fairnessText(1.0)).toMatch(/^hsl\(\d+, 60%, 72%\)$/);
  });
});
