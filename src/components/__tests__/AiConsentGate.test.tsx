import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AiConsentGate from '../AiConsentGate';
import { AI_CONSENT_VERSION, getAiProviderState, resetAiProviderStateForTests } from '@/utils/aiProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

beforeEach(() => {
  localStorage.clear();
  resetAiProviderStateForTests();
});

describe('AiConsentGate', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AiConsentGate isOpen={false} onAccepted={jest.fn()} onCancel={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** @critical - every box must be ticked before the AI feature can be enabled. */
  it('enables Continue only when all three boxes are ticked, then records the consent version', () => {
    const onAccepted = jest.fn();
    render(<AiConsentGate isOpen onAccepted={onAccepted} onCancel={jest.fn()} />);
    const accept = screen.getByTestId('ai-consent-accept');
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByTestId('ai-consent-box-1'));
    fireEvent.click(screen.getByTestId('ai-consent-box-2'));
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByTestId('ai-consent-box-3'));
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(getAiProviderState().consentVersion).toBe(AI_CONSENT_VERSION);
  });

  it('cancel and Escape close without consenting', () => {
    const onCancel = jest.fn();
    render(<AiConsentGate isOpen onAccepted={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(getAiProviderState().hasConsent).toBe(false);
  });

  it('states the data facts and the dictation rules', () => {
    render(<AiConsentGate isOpen onAccepted={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getAllByText(/MatchOps never receives/).length).toBeGreaterThan(0);
    expect(screen.getByText(/never full names/)).toBeInTheDocument();
    expect(screen.getByText(/spend cap/)).toBeInTheDocument();
  });
});
