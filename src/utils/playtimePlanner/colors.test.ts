import { fairnessHue, fairnessFill, fairnessText, fairnessCell, fairnessChipColors } from './colors';

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
    expect(fairnessFill(null)).toBe('#334155');
    expect(fairnessText(null)).toBe('#94a3b8');
    expect(fairnessCell(null)).toBe('#334155');
  });

  it('chip colours band the text contrast: cream on red/green ends, dark on yellow', () => {
    expect(fairnessChipColors(0.4)).toEqual({ bg: 'hsl(0, 72%, 46%)', fg: '#fef2f2' }); // red end
    expect(fairnessChipColors(0.95).fg).toBe('#1a1a1a'); // bright yellow middle
    expect(fairnessChipColors(1.5)).toEqual({ bg: 'hsl(130, 55%, 40%)', fg: '#ecfdf5' }); // green end
    expect(fairnessChipColors(null)).toEqual({ bg: '#475569', fg: '#e2e8f0' }); // no signal
  });

  it('emits hsl() strings on the ramp', () => {
    expect(fairnessFill(0.4)).toBe('hsl(0, 62%, 34%)');
    expect(fairnessCell(1.5)).toBe('hsl(130, 60%, 36%)');
    expect(fairnessText(1.0)).toMatch(/^hsl\(\d+, 80%, 68%\)$/);
  });
});
