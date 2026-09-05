/**
 * Kirjuri AI settings card.
 * @critical - the gate precedes the key, the key is stored only after the
 * provider accepts it, and disconnect removes it from the device.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import AiSettingsCard from '../AiSettingsCard';
import { deleteAllClips } from '@/utils/audioClipStore';
import { acceptAiConsent, getAiProviderState, resetAiProviderStateForTests, setAiProviderKey } from '@/utils/aiProvider';
import { recordAiUsage, resetAiUsageStateForTests } from '@/utils/aiUsage';

const showToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
jest.mock('@/utils/audioClipStore', () => ({ deleteAllClips: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetAiProviderStateForTests();
  resetAiUsageStateForTests();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('AiSettingsCard', () => {
  it('starts with Set up only - no key field before consent', () => {
    render(<AiSettingsCard userId="u1" />);
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Not connected');
    expect(screen.getByTestId('ai-setup')).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
  });

  it('gate -> key -> provider check -> connected; disconnect removes the key', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    render(<AiSettingsCard userId="u1" />);
    fireEvent.click(screen.getByTestId('ai-setup'));
    fireEvent.click(screen.getByTestId('ai-consent-box-1'));
    fireEvent.click(screen.getByTestId('ai-consent-box-2'));
    fireEvent.click(screen.getByTestId('ai-consent-box-3'));
    fireEvent.click(screen.getByTestId('ai-consent-accept'));

    const input = screen.getByLabelText(/API key/);
    fireEvent.change(input, { target: { value: 'sk-proj-abcdefghijklmnop9876' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-connect'));
    });
    await waitFor(() => expect(screen.getByTestId('ai-status')).toHaveTextContent('Connected'));
    expect(screen.getByTestId('ai-connected-line')).toHaveTextContent('••••9876');
    expect(getAiProviderState().connected).toBe(true);
    expect(showToast).toHaveBeenCalledWith('AI provider connected.', 'success');

    fireEvent.click(screen.getByTestId('ai-disconnect'));
    expect(localStorage.getItem('matchops_ai_key')).toBeNull();
    expect(screen.getByTestId('ai-status')).toHaveTextContent('Not connected');
  });

  /** @critical - a rejected key is never stored. */
  it('does not store a key the provider rejects', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    acceptAiConsent();
    render(<AiSettingsCard userId="u1" />);
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-bad-abcdefghijklmnop' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-connect'));
    });
    expect(localStorage.getItem('matchops_ai_key')).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/rejected/), 'error');
  });

  it('pseudonymization toggle persists', () => {
    acceptAiConsent();
    setAiProviderKey('sk-abcdefghijklmnop');
    render(<AiSettingsCard userId="u1" />);
    const box = screen.getByTestId('ai-pseudonymize') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(getAiProviderState().pseudonymize).toBe(false);
  });

  /** The number a coach checks to answer "is this costing me anything?". */
  it('shows nothing used until a request happens, then the running estimate', () => {
    const { rerender } = render(<AiSettingsCard userId="u1" />);
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('Nothing used on this device yet.');

    act(() => {
      recordAiUsage('drafting', 0.0021);
      recordAiUsage('transcription', 0.003);
    });
    rerender(<AiSettingsCard userId="u1" />);

    const usage = screen.getByTestId('ai-usage');
    expect(usage).toHaveTextContent('~$0.01');
    expect(usage).toHaveTextContent('1 transcriptions, 1 report drafts');
    // Never presented as the real bill.
    expect(usage).toHaveTextContent(/estimate/i);

    act(() => {
      fireEvent.click(screen.getByTestId('ai-usage-reset'));
    });
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('Nothing used on this device yet.');
  });

  it('delete all recordings asks first, then clears the device store', async () => {
    render(<AiSettingsCard userId="u1" />);
    fireEvent.click(screen.getByTestId('ai-delete-recordings'));
    expect(deleteAllClips).not.toHaveBeenCalled();
    expect(screen.getByText('Delete all recordings?')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    expect(deleteAllClips).toHaveBeenCalledWith('u1');
  });
});
