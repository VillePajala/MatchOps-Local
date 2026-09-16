/**
 * @jest-environment jsdom
 * @critical - the match clock is read at a glance from the touchline. A clock
 * that slides sideways as it ticks is harder to read than a still one, and the
 * property that was supposed to prevent it does nothing in this font.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SteadyDigits from './SteadyDigits';

const boxes = () =>
  Array.from(
    screen.getByTestId('steady-digits').querySelectorAll('span[aria-hidden] > span'),
  ) as HTMLElement[];

describe('SteadyDigits', () => {
  it('gives every digit the same width', () => {
    render(<SteadyDigits>11:88</SteadyDigits>);
    const widths = boxes()
      .filter((el) => /\d/.test(el.textContent ?? ''))
      .map((el) => el.style.width);
    expect(new Set(widths).size).toBe(1);
    expect(widths).toHaveLength(4);
  });

  /**
   * The whole point: "1" and "8" are 0.334em and 0.542em in Rajdhani, so an
   * unboxed clock moves. Both must occupy the same box.
   */
  it('boxes the narrowest and widest digit identically', () => {
    render(<SteadyDigits>18</SteadyDigits>);
    const [one, eight] = boxes();
    expect(one.textContent).toBe('1');
    expect(eight.textContent).toBe('8');
    expect(one.style.width).toBe(eight.style.width);
  });

  /** A colon is much narrower; boxing it as a digit would pad the clock oddly. */
  it('gives the colon its own narrower box', () => {
    render(<SteadyDigits>1:2</SteadyDigits>);
    const [digit, colon] = boxes();
    expect(colon.textContent).toBe(':');
    expect(parseFloat(colon.style.width)).toBeLessThan(parseFloat(digit.style.width));
  });

  /** Widths are in em so the boxes scale with whatever size the caller sets. */
  it('sizes the boxes relative to the font, not in pixels', () => {
    render(<SteadyDigits>12:47</SteadyDigits>);
    boxes().forEach((el) => expect(el.style.width).toMatch(/em$/));
  });

  /** Splitting the string must not make a screen reader spell it out. */
  it('exposes the whole value once and hides the pieces', () => {
    render(<SteadyDigits>12:47</SteadyDigits>);
    expect(screen.getByText('12:47')).toHaveClass('sr-only');
    expect(
      screen.getByTestId('steady-digits').querySelector('span[aria-hidden="true"]'),
    ).toBeInTheDocument();
  });

  it('keeps the caller’s classes', () => {
    render(<SteadyDigits className="text-9xl font-bold">0:00</SteadyDigits>);
    expect(screen.getByTestId('steady-digits')).toHaveClass('text-9xl', 'font-bold');
  });

  /** Anything that is not a ticking character keeps its natural width. */
  it('leaves other characters unboxed', () => {
    render(<SteadyDigits>-1</SteadyDigits>);
    expect(boxes()).toHaveLength(1);
    expect(screen.getByTestId('steady-digits')).toHaveTextContent('-1');
  });
});
