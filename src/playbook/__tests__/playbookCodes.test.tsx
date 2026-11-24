import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { formatCodeInput, isCodeComplete, normaliseCode, redeemPlaybookCode, type RedeemCodeResult } from '../playbookCodes';
import PlaybookCodeSheet from '../PlaybookCodeSheet';
import PlaybookLibrary from '../PlaybookLibrary';
import type { Concept } from '../types';
import type { Playbook } from '../usePlaybooks';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback || key;
      if (!options) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(options[name] ?? ''));
    },
  }),
}));

const mockWarn = jest.fn();
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { warn: (...a: unknown[]) => mockWarn(...a), debug: jest.fn(), error: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { getSession: mockGetSession }, rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

// The library's data, for the integration tests at the end.
let mockPlaybooks: Playbook[] = [];
let mockRedeem: ((code: string) => Promise<RedeemCodeResult>) | undefined;
jest.mock('../usePlaybooks', () => ({
  usePlaybooks: () => ({ playbooks: mockPlaybooks, status: 'ready', refresh: jest.fn(), redeemCode: mockRedeem }),
}));
jest.mock('../PlaybookPresentation', () => ({ __esModule: true, default: () => <div data-testid="presentation" /> }));

const USER = 'user-1';

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

describe('code input', () => {
  it('shows the code upper-case, keeps dashes, drops everything else', () => {
    expect(formatCodeInput('pepo-7kq2 m9xd!')).toBe('PEPO-7KQ2M9XD');
  });

  it('sends letters and digits only, with or without dashes and spaces', () => {
    expect(normaliseCode('pepo-7kq2-m9xd')).toBe('PEPO7KQ2M9XD');
    expect(normaliseCode(' PEPO 7KQ2–M9XD ')).toBe('PEPO7KQ2M9XD');
  });

  it('is complete from 4 to 40 characters (dashes not counted)', () => {
    expect(isCodeComplete('AB-C')).toBe(false);
    expect(isCodeComplete('AB-CD')).toBe(true);
    expect(isCodeComplete('A'.repeat(41))).toBe(false);
  });
});

describe('redeemPlaybookCode', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockWarn.mockReset();
    mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: USER } } } });
    setOnline(true);
  });

  it('sends the normalised code and maps a grant', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, playbook_id: 'pepo-8v8', playbook_name: 'PEPO' }, error: null });
    await expect(redeemPlaybookCode('pepo-7kq2-m9xd', USER)).resolves.toEqual({
      ok: true,
      playbookId: 'pepo-8v8',
      playbookName: 'PEPO',
      already: false,
    });
    expect(mockRpc).toHaveBeenCalledWith('redeem_playbook_code', { p_code: 'PEPO7KQ2M9XD' });
  });

  it('maps "already unlocked"', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, already: true, playbook_id: 'pepo-8v8', playbook_name: 'PEPO' }, error: null });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toMatchObject({ ok: true, already: true });
  });

  it.each(['invalid', 'expired', 'used_up', 'revoked', 'rate_limited'] as const)('passes the server reason %s on', async (reason) => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: reason }, error: null });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: reason });
  });

  /** @edge-case nothing the server says is passed on unless it is a known reason */
  it('an unknown answer is "failed"', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'something internal' }, error: null });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'failed' });
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'failed' });
    expect(mockWarn).toHaveBeenCalled();
  });

  it('a too short code is invalid without asking the server', async () => {
    await expect(redeemPlaybookCode('A-B', USER)).resolves.toEqual({ ok: false, error: 'invalid' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('offline: no request', async () => {
    setOnline(false);
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'offline' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a connection failure is "offline", any other error "failed"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'offline' });
    mockRpc.mockRejectedValue(new Error('Load failed'));
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'offline' });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function redeem_playbook_code' } });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'failed' });
  });

  /** @edge-case without this user's session the call would run as someone else */
  it('no session for the user: no request', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(redeemPlaybookCode('ABCD-EFGH', USER)).resolves.toEqual({ ok: false, error: 'failed' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('PlaybookCodeSheet', () => {
  function renderSheet(result: RedeemCodeResult) {
    const onRedeem = jest.fn().mockResolvedValue(result);
    const onUnlocked = jest.fn();
    const onClose = jest.fn();
    render(<PlaybookCodeSheet onClose={onClose} onRedeem={onRedeem} onUnlocked={onUnlocked} />);
    return { onRedeem, onUnlocked, onClose };
  }
  const type = (v: string) => fireEvent.change(screen.getByTestId('playbook-code-input'), { target: { value: v } });
  const submit = async () => {
    await act(async () => {
      fireEvent.click(screen.getByTestId('playbook-code-submit'));
    });
  };

  it('upper-cases the input and enables Unlock only for a complete code', () => {
    renderSheet({ ok: false, error: 'invalid' });
    expect(screen.getByTestId('playbook-code-submit')).toBeDisabled();
    type('pepo-7k');
    expect(screen.getByTestId('playbook-code-input')).toHaveValue('PEPO-7K');
    expect(screen.getByTestId('playbook-code-submit')).toBeEnabled();
  });

  /** @critical */
  it('a working code: tells which playbook opened and hands its id to the library', async () => {
    const { onRedeem, onUnlocked, onClose } = renderSheet({ ok: true, playbookId: 'pepo-8v8', playbookName: 'PEPO 8v8', already: false });
    type('pepo-7kq2-m9xd');
    await submit();
    expect(onRedeem).toHaveBeenCalledWith('PEPO-7KQ2-M9XD');
    expect(onUnlocked).toHaveBeenCalledWith('pepo-8v8');
    expect(screen.getByTestId('playbook-code-success')).toHaveTextContent('PEPO 8v8 unlocked');
    fireEvent.click(screen.getByTestId('playbook-code-show'));
    expect(onClose).toHaveBeenCalled();
  });

  it('already unlocked says so', async () => {
    renderSheet({ ok: true, playbookId: 'pepo-8v8', playbookName: 'PEPO 8v8', already: true });
    type('ABCD-EFGH');
    await submit();
    expect(screen.getByTestId('playbook-code-success')).toHaveTextContent('PEPO 8v8 is already unlocked');
  });

  it.each([
    ['invalid', "That code doesn't work. Check it and try again."],
    ['expired', 'This code has expired. Ask your club for a new one.'],
    ['used_up', 'This code has been used up. Ask your club for a new one.'],
    ['revoked', 'This code is no longer valid. Ask your club for a new one.'],
    ['rate_limited', 'Too many attempts. Try again in an hour.'],
    ['offline', 'A network connection is needed.'],
    ['failed', 'Something went wrong. Try again.'],
  ] as const)('%s: shows its own message, keeps the code, clears it when typing', async (error, message) => {
    const { onUnlocked } = renderSheet({ ok: false, error });
    type('ABCD-EFGH');
    await submit();
    expect(screen.getByTestId('playbook-code-error')).toHaveTextContent(message);
    expect(screen.getByTestId('playbook-code-input')).toHaveValue('ABCD-EFGH');
    expect(screen.getByTestId('playbook-code-input')).toHaveAttribute('aria-invalid', 'true');
    expect(onUnlocked).not.toHaveBeenCalled();
    type('ABCD-EFGHJ');
    expect(screen.getByTestId('playbook-code-error')).toHaveTextContent('');
  });

  it('Escape and the backdrop close it', () => {
    const { onClose } = renderSheet({ ok: false, error: 'invalid' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('playbook-code-sheet').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('the library with club codes', () => {
  /** SYNTHETIC concept. */
  const concept = (id: string): Concept => ({
    id,
    title: `Title ${id}`,
    phase: 'Perusteet',
    format: '8v8',
    version: 1,
    players: [{ id: 'p', side: 'us', start: [30, 60] }],
    steps: [{ title: 'First', text: 'Text', ball: 'p' }],
  });
  const examples: Playbook = { id: 'matchops-examples', name: 'x', builtIn: true, concepts: [concept('demo')] };
  const club: Playbook = { id: 'club', name: 'Club book', builtIn: false, concepts: [concept('club-a')] };

  beforeEach(() => {
    mockPlaybooks = [examples];
    mockRedeem = undefined;
  });

  it('no entry when the account cannot unlock (local mode)', () => {
    render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    expect(screen.queryByTestId('playbook-code-open')).toBeNull();
  });

  it('no entry while picking a game\'s themes', () => {
    mockRedeem = jest.fn();
    render(<PlaybookLibrary isOpen onClose={jest.fn()} selection={{ initial: [], onDone: jest.fn() }} />);
    expect(screen.queryByTestId('playbook-code-open')).toBeNull();
  });

  /** @critical */
  it('a working code switches the library to the unlocked playbook', async () => {
    mockRedeem = jest.fn(async () => {
      mockPlaybooks = [club, examples];
      return { ok: true as const, playbookId: 'club', playbookName: 'Club book', already: false };
    });
    const onClose = jest.fn();
    const { rerender } = render(<PlaybookLibrary isOpen onClose={onClose} />);
    expect(screen.getByTestId('playbook-playbook-name')).toHaveTextContent('PePo Ops: 8v8 basics');
    fireEvent.click(screen.getByTestId('playbook-code-open'));
    // Escape belongs to the sheet while it is open, not to the library.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('playbook-code-open'));
    fireEvent.change(screen.getByTestId('playbook-code-input'), { target: { value: 'club-1234' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('playbook-code-submit'));
    });
    rerender(<PlaybookLibrary isOpen onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('playbook-code-success')).toHaveTextContent('Club book unlocked'));
    fireEvent.click(screen.getByTestId('playbook-code-show'));
    expect(screen.queryByTestId('playbook-code-sheet')).toBeNull();
    expect(screen.getByTestId('playbook-playbook-name')).toHaveTextContent('Club book');
    expect(screen.getByText('Title club-a')).toBeInTheDocument();
  });
});
