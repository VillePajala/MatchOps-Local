import React from 'react';

/**
 * Digits that hold still while the number changes.
 *
 * THE PROBLEM, MEASURED. Rajdhani's digits are proportional and the spread is
 * large: "1" is 0.334 em and "8" is 0.542 em, a difference of 0.208 em. At the
 * timer overlay's 10rem that is 33px per digit, so a centred clock visibly
 * jumps sideways every time a digit ticks over - worst case around 60px
 * between 11:11 and 88:88.
 *
 * WHY THE EXISTING FIX DID NOT WORK. The clock already carried Tailwind's
 * `tabular-nums`. That compiles to `font-variant-numeric: tabular-nums`, which
 * asks the FONT for its tabular figures - and Rajdhani has no `tnum` feature
 * at all (its feature list is Devanagari shaping only: abvm, akhn, blwf,
 * half, nukt, pres, psts, rphf, vatu). The property was inert, in this
 * component and everywhere else in the app that uses it.
 *
 * THE FIX. Give every digit the same box and centre the glyph in it, which is
 * precisely what a tabular figure is - just done in CSS because the font will
 * not do it. Font-agnostic, so it survives a future typeface change, and it
 * costs nothing at runtime.
 *
 * Rejected alternatives: setting the clock in a font that does have tabular
 * figures loses Rajdhani's numerals, which are half the reason the pitch
 * screen reads as a football app; and substituting digits from another face
 * via `unicode-range` would make every number in the app a different typeface
 * from its own label.
 *
 * ACCESSIBILITY. The split is visual only. Screen readers would otherwise
 * announce "1, 2, colon, 4, 7", so the pieces are hidden and the whole string
 * is exposed once - the text is unchanged, only its boxes are.
 *
 * @module SteadyDigits
 * @category Components
 */
export interface SteadyDigitsProps {
  /** The already-formatted string, e.g. "12:47". */
  children: string;
  className?: string;
}

/**
 * Widths in em, so they scale with whatever font-size the caller sets.
 * Each is a little over the widest glyph it must hold: digits 0.542 -> 0.56,
 * colon 0.204 -> 0.24. The slack is what keeps a bold weight from touching
 * its neighbour.
 */
const DIGIT_EM = 0.56;
const COLON_EM = 0.24;

export const SteadyDigits: React.FC<SteadyDigitsProps> = ({ children, className = '' }) => (
  <span className={className} data-testid="steady-digits">
    {/* One accessible copy of the real string. */}
    <span className="sr-only">{children}</span>
    <span aria-hidden="true">
      {Array.from(children).map((char, i) => {
        const isDigit = char >= '0' && char <= '9';
        const isColon = char === ':';
        // Anything else - a minus sign, a stray space - keeps its natural
        // width. Only the characters that recur in a ticking value need to be
        // boxed, and forcing the rest would misalign punctuation.
        if (!isDigit && !isColon) return <React.Fragment key={i}>{char}</React.Fragment>;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: `${isColon ? COLON_EM : DIGIT_EM}em`,
              textAlign: 'center',
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  </span>
);

export default SteadyDigits;
