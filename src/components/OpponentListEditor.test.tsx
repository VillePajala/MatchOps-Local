/**
 * @critical - prevention is the cheaper half of the whole feature. Stopping
 * "Ips" from being added when "IPS" is already known beats cleaning it up
 * afterwards, and if this list itself accumulates variants then the sweep tool
 * is cleaning up a mess the app created.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpponentListEditor from './OpponentListEditor';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(options?.[n] ?? '')),
  }),
}));

/** Controlled wrapper, so the assertions see what a coach would see. */
const Harness: React.FC<{ initial?: string[]; suggestions?: string[] }> = ({
  initial = [],
  suggestions = [],
}) => {
  const [value, setValue] = useState<string[]>(initial);
  return <OpponentListEditor value={value} onChange={setValue} suggestions={suggestions} />;
};

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('opponent-input'), { target: { value: text } });

describe('OpponentListEditor', () => {
  it('adds a team and clears the field', () => {
    render(<Harness />);
    type('IPS');
    fireEvent.click(screen.getByTestId('opponent-add'));
    expect(screen.getByTestId('opponent-list')).toHaveTextContent('IPS');
    expect((screen.getByTestId('opponent-input') as HTMLInputElement).value).toBe('');
  });

  it('refuses a spelling of a team already listed, and says which', () => {
    render(<Harness initial={['IPS']} />);
    type('ips');
    expect(screen.getByTestId('opponent-duplicate')).toHaveTextContent('IPS is already on the list.');
    expect(screen.getByTestId('opponent-add')).toBeDisabled();
  });

  /**
   * @critical - the prevention case. The coach is told they already write this
   * name another way, and can adopt that spelling in one tap.
   */
  it('offers the spelling already used elsewhere', () => {
    render(<Harness suggestions={['IPS Punainen']} />);
    type('ips punainen');
    expect(screen.getByTestId('opponent-known-elsewhere')).toHaveTextContent('IPS Punainen');

    fireEvent.click(screen.getByTestId('opponent-use-existing'));
    // The KNOWN spelling goes in, not the one just typed.
    expect(screen.getByTestId('opponent-list')).toHaveTextContent('IPS Punainen');
    expect(screen.getByTestId('opponent-list')).not.toHaveTextContent('ips punainen');
  });

  it('stays quiet when the typed spelling already matches the known one', () => {
    render(<Harness suggestions={['IPS']} />);
    type('IPS');
    expect(screen.queryByTestId('opponent-known-elsewhere')).not.toBeInTheDocument();
  });

  /**
   * @critical - two teams of one club differ by a single word, and both must
   * be addable. This is the case that rules out fuzzy matching.
   */
  it('lets both of a club’s teams onto the list', () => {
    render(<Harness initial={['IPS/Punainen']} suggestions={['IPS/Punainen']} />);
    type('IPS/Sininen');
    expect(screen.queryByTestId('opponent-duplicate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opponent-add'));
    const list = screen.getByTestId('opponent-list');
    expect(list).toHaveTextContent('IPS/Punainen');
    expect(list).toHaveTextContent('IPS/Sininen');
  });

  it('removes a team', () => {
    render(<Harness initial={['IPS', 'KuPS']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove IPS' }));
    expect(screen.getByTestId('opponent-list')).not.toHaveTextContent('IPS');
    expect(screen.getByTestId('opponent-list')).toHaveTextContent('KuPS');
  });

  /**
   * @edge-case - this editor sits inside the league form. Enter must add a
   * team, never submit the whole competition while the coach is mid-list.
   */
  it('adds on Enter without submitting the surrounding form', () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );
    type('KuPS');
    fireEvent.keyDown(screen.getByTestId('opponent-input'), { key: 'Enter' });
    expect(screen.getByTestId('opponent-list')).toHaveTextContent('KuPS');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says the list is empty without implying the coach must fill it', () => {
    render(<Harness />);
    expect(screen.getByTestId('opponent-empty')).toHaveTextContent(/type an opponent by hand/i);
  });
});
