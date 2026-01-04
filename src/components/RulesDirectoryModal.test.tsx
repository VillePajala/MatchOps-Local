import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import RulesDirectoryModal from './RulesDirectoryModal';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

// Mock window.open
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

describe('RulesDirectoryModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests that modal returns null when closed
   * @critical
   */
  it('should not render when isOpen is false', () => {
    const { container } = render(
      <RulesDirectoryModal isOpen={false} onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  /**
   * Tests that modal renders correctly when open
   * @critical
   */
  it('should render modal when isOpen is true', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Verify title is present
    expect(screen.getByText('Säännöt')).toBeInTheDocument();

    // Verify section headers are present
    expect(screen.getByText('Sääntökirjat (PDF)')).toBeInTheDocument();
    expect(screen.getByText('Palloliitto.fi')).toBeInTheDocument();
    expect(screen.getByText('Kansainväliset')).toBeInTheDocument();

    // Verify footer text is present
    expect(screen.getByText('Linkit avautuvat selaimessa. Säännöt ylläpitää Palloliitto.')).toBeInTheDocument();
  });

  /**
   * Tests that onClose is called when Done button is clicked
   * @critical
   */
  it('should call onClose when Done button clicked', () => {
    const onClose = jest.fn();
    render(<RulesDirectoryModal isOpen={true} onClose={onClose} />);

    const doneButton = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Tests that all rule links are rendered
   * @critical
   */
  it('should render all rule links correctly', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Check all 5 link buttons are present
    expect(screen.getByText('Jalkapallosäännöt 2025')).toBeInTheDocument();
    expect(screen.getByText('Futsalsäännöt 2024-2025')).toBeInTheDocument();
    expect(screen.getByText('Kaikki Pelaa (U6-U11)')).toBeInTheDocument();
    expect(screen.getByText('Kaikki säännöt ja määräykset')).toBeInTheDocument();
    expect(screen.getByText('FIFA Laws of the Game')).toBeInTheDocument();
  });

  /**
   * Tests that clicking Soccer Rules link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Soccer Rules', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const soccerRulesButton = screen.getByText('Jalkapallosäännöt 2025').closest('button');
    fireEvent.click(soccerRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www-assets.palloliitto.fi/62562/1739435685-jalkapallosaannot-2025.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking Futsal Rules link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Futsal Rules', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const futsalRulesButton = screen.getByText('Futsalsäännöt 2024-2025').closest('button');
    fireEvent.click(futsalRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www-assets.palloliitto.fi/62562/1731591861-futsalsaannot-2024-2025-pdf.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking Youth Rules link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Youth Rules', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const youthRulesButton = screen.getByText('Kaikki Pelaa (U6-U11)').closest('button');
    fireEvent.click(youthRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www-assets.palloliitto.fi/62562/1712318638-kaikki-pelaa-saantojen-tiivistelma-2024-jalkapallo.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking Palloliitto main page link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Palloliitto main page', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const allRulesButton = screen.getByText('Kaikki säännöt ja määräykset').closest('button');
    fireEvent.click(allRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking FIFA Laws link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for FIFA Laws', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const fifaLawsButton = screen.getByText('FIFA Laws of the Game').closest('button');
    fireEvent.click(fifaLawsButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.theifab.com/laws-of-the-game',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that all links use security attributes
   * @edge-case
   */
  it('should use noopener,noreferrer for all external links', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Get all link buttons (5 total)
    const allButtons = screen.getAllByRole('button');
    // Filter to get only link buttons (not the Done button)
    const linkButtons = allButtons.filter(btn => btn.textContent !== 'Done');

    expect(linkButtons).toHaveLength(5);

    // Click each link button and verify security params
    linkButtons.forEach(button => {
      mockWindowOpen.mockClear();
      fireEvent.click(button);
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.any(String),
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
