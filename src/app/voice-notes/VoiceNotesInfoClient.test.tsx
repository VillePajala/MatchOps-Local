/**
 * @critical - this is the page a coach sends to a parent. Every line is a
 * claim about the code, so it renders from the real dictionary and is checked
 * against what the consent gate promises.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { VoiceNotesInfoClient } from './VoiceNotesInfoClient';

const mockEN: Record<string, string> = (() => {
  const flat: Record<string, string> = {};
  const walk = (node: unknown, prefix: string) => {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else flat[`${prefix}${k}`] = String(v);
    }
  };
  walk(jest.requireActual('../../../public/locales/en/common.json'), '');
  return flat;
})();
const mockMissing = new Set<string>();
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (!(key in mockEN)) mockMissing.add(key);
      return mockEN[key] ?? key;
    },
  }),
}));

describe('VoiceNotesInfoClient', () => {
  it('renders every line from a real key', () => {
    mockMissing.clear();
    render(<VoiceNotesInfoClient />);
    expect([...mockMissing]).toEqual([]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What leaves the phone');
  });

  it('makes the same promises as the consent gate', () => {
    render(<VoiceNotesInfoClient />);
    // Recordings never reach MatchOps; names go as codes; nothing without a button.
    expect(screen.getByText(/never sent to MatchOps/)).toBeInTheDocument();
    expect(screen.getByText(/replaced with codes such as P1 and P2/)).toBeInTheDocument();
    expect(screen.getByText(/only when the coach presses a button/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy-policy');
  });
});
