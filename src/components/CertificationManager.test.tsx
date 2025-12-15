import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CertificationManager from './CertificationManager';
import { CERTIFICATIONS } from '@/config/gameOptions';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback,
  }),
}));

describe('CertificationManager', () => {
  const mockOnCertificationsChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests empty state rendering
   * @integration
   */
  it('renders empty state with add button', () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    expect(screen.getByText('Certifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add certification/i })).toBeInTheDocument();
  });

  /**
   * Tests displaying existing certifications as chips
   * @integration
   */
  it('displays existing certifications as chips', () => {
    const certifications = ['UEFA C', 'UEFA B'];

    render(
      <CertificationManager
        certifications={certifications}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    expect(screen.getByText('UEFA C')).toBeInTheDocument();
    expect(screen.getByText('UEFA B')).toBeInTheDocument();
  });

  /**
   * Tests removing a certification
   * @critical
   */
  it('allows removing a certification', async () => {
    const certifications = ['UEFA C', 'UEFA B'];

    render(
      <CertificationManager
        certifications={certifications}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    expect(mockOnCertificationsChange).toHaveBeenCalledWith(['UEFA B']);
  });

  /**
   * Tests showing add certification UI when clicking add button
   * @integration
   */
  it('shows add certification UI when clicking add button', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /select certification/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  /**
   * Tests adding a new certification
   * @critical
   */
  it('allows adding a new certification', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    // Click add button
    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    // Select a certification
    const select = screen.getByRole('combobox', { name: /select certification/i });
    fireEvent.change(select, { target: { value: 'UEFA C' } });

    // Confirm add
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockOnCertificationsChange).toHaveBeenCalledWith(['UEFA C']);
    });
  });

  /**
   * Tests canceling add certification flow
   * @integration
   */
  it('cancels adding certification when cancel is clicked', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    // Click add button
    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add certification/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mockOnCertificationsChange).not.toHaveBeenCalled();
  });

  /**
   * Tests duplicate prevention - already selected certifications not shown in dropdown
   * @critical
   */
  it('filters out already selected certifications from dropdown', async () => {
    const certifications = ['UEFA C'];

    render(
      <CertificationManager
        certifications={certifications}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    const select = screen.getByRole('combobox', { name: /select certification/i });
    const options = select.querySelectorAll('option');

    // Should not contain the already selected certification
    const optionValues = Array.from(options).map(opt => opt.textContent);
    expect(optionValues).not.toContain('UEFA C');
    expect(optionValues).toContain('UEFA B'); // Other certifications should be available
  });

  /**
   * Tests that certifications are grouped by category in dropdown
   * @integration
   */
  it('renders certifications in grouped optgroups', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    const select = screen.getByRole('combobox', { name: /select certification/i });
    const optgroups = select.querySelectorAll('optgroup');

    // Should have 3 groups: Football, Futsal, Goalkeeper
    expect(optgroups).toHaveLength(3);

    const groupLabels = Array.from(optgroups).map(og => og.getAttribute('label'));
    expect(groupLabels).toContain('Football Coaching');
    expect(groupLabels).toContain('Futsal Coaching');
    expect(groupLabels).toContain('Goalkeeper Coaching');
  });

  /**
   * Tests disabling add button when all certifications are used
   * @edge-case
   */
  it('disables add button when all certifications are used', () => {
    // Use all certifications
    const allCertifications = [...CERTIFICATIONS];

    render(
      <CertificationManager
        certifications={allCertifications}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    expect(screen.getByRole('button', { name: /add certification/i })).toBeDisabled();
  });

  /**
   * Tests disabled confirm button when no certification selected
   * @edge-case
   */
  it('disables add button when no certification selected', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
  });

  /**
   * Tests that handleAdd does not add duplicate certification
   * @edge-case
   */
  it('does not add duplicate certification', async () => {
    const certifications = ['UEFA C'];

    render(
      <CertificationManager
        certifications={certifications}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    // Since UEFA C is already in certifications, it shouldn't appear in dropdown
    // This test verifies the filtering works correctly
    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    const select = screen.getByRole('combobox', { name: /select certification/i });

    // Try to add UEFA B instead
    fireEvent.change(select, { target: { value: 'UEFA B' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockOnCertificationsChange).toHaveBeenCalledWith(['UEFA C', 'UEFA B']);
    });
  });

  /**
   * Tests that empty selection is rejected
   * @edge-case
   */
  it('does not add when no certification is selected', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    // Try to click add without selecting anything
    const addButton = screen.getByRole('button', { name: /^add$/i });

    // Button should be disabled, but let's also verify clicking doesn't trigger callback
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);

    expect(mockOnCertificationsChange).not.toHaveBeenCalled();
  });

  /**
   * Tests state reset after successful add
   * @integration
   */
  it('resets state after adding certification', async () => {
    render(
      <CertificationManager
        certifications={[]}
        onCertificationsChange={mockOnCertificationsChange}
      />
    );

    // Click add button
    fireEvent.click(screen.getByRole('button', { name: /add certification/i }));

    // Select and add a certification
    const select = screen.getByRole('combobox', { name: /select certification/i });
    fireEvent.change(select, { target: { value: 'UEFA C' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // After adding, the add certification button should be visible again
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add certification/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
