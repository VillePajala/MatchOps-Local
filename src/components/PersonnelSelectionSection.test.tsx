/**
 * @critical Tests for PersonnelSelectionSection component
 * Validates checkbox selection, select all functionality, and user interactions
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import { Personnel } from '@/types/personnel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      // Handle string fallback (old pattern)
      if (typeof options === 'string') {
        return options;
      }
      // Handle object with defaultValue and interpolation variables
      if (options && typeof options === 'object' && 'defaultValue' in options) {
        let result = options.defaultValue as string;
        // Replace interpolation variables like {{name}} with actual values
        Object.keys(options).forEach((optKey) => {
          if (optKey !== 'defaultValue') {
            const value = options[optKey];
            result = result.replace(new RegExp(`{{\\s*${optKey}\\s*}}`, 'g'), String(value));
          }
        });
        return result;
      }
      // Fallback to key if no options
      return key;
    },
  }),
}));

describe('PersonnelSelectionSection', () => {
  const mockPersonnel: Personnel[] = [
    {
      id: 'personnel_1',
      name: 'John Coach',
      role: 'head_coach',
      phone: '+1234567890',
      email: 'john@example.com',
      certifications: ['UEFA A'],
      notes: 'Available weekdays',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'personnel_2',
      name: 'Jane Assistant',
      role: 'assistant_coach',
      phone: '',
      email: '',
      certifications: [],
      notes: '',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
    {
      id: 'personnel_3',
      name: 'Bob Physio',
      role: 'physio',
      phone: '',
      email: '',
      certifications: [],
      notes: '',
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    },
  ];

  const defaultProps = {
    availablePersonnel: mockPersonnel,
    selectedPersonnelIds: [],
    onSelectedPersonnelChange: jest.fn(),
    title: 'Select Personnel',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with title and personnel count', () => {
      render(<PersonnelSelectionSection {...defaultProps} />);

      expect(screen.getByText('Select Personnel')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument(); // Selected count
      expect(screen.getByText('3')).toBeInTheDocument(); // Total count
    });

    it('should render all available personnel', () => {
      render(<PersonnelSelectionSection {...defaultProps} />);

      expect(screen.getByText('John Coach')).toBeInTheDocument();
      expect(screen.getByText('Jane Assistant')).toBeInTheDocument();
      expect(screen.getByText('Bob Physio')).toBeInTheDocument();
    });

    it('should render Select All checkbox', () => {
      render(<PersonnelSelectionSection {...defaultProps} />);

      expect(screen.getByText('Select All')).toBeInTheDocument();
    });

    it('should display empty state when no personnel available', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          availablePersonnel={[]}
        />
      );

      expect(screen.getByText('No personnel available. Add personnel in Personnel Manager.')).toBeInTheDocument();
    });
  });

  describe('Selection Behavior', () => {
    it('should call onChange when individual personnel is selected', () => {
      const onChangeMock = jest.fn();
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          onSelectedPersonnelChange={onChangeMock}
        />
      );

      const checkbox = screen.getAllByRole('checkbox')[1]; // First personnel (index 0 is Select All)
      fireEvent.click(checkbox);

      expect(onChangeMock).toHaveBeenCalledWith(['personnel_1']);
    });

    it('should call onChange when individual personnel is deselected', () => {
      const onChangeMock = jest.fn();
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1', 'personnel_2']}
          onSelectedPersonnelChange={onChangeMock}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      const firstPersonnelCheckbox = checkboxes[1]; // Skip Select All
      fireEvent.click(firstPersonnelCheckbox);

      expect(onChangeMock).toHaveBeenCalledWith(['personnel_2']);
    });

    it('should update selected count when personnel selected', () => {
      const { rerender } = render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={[]}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();

      rerender(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1', 'personnel_2']}
        />
      );

      const selectedCounts = screen.getAllByText('2');
      expect(selectedCounts.length).toBeGreaterThan(0);
    });

    it('should show checkboxes as checked for selected personnel', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1', 'personnel_3']}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[1].checked).toBe(true);  // personnel_1
      expect(checkboxes[2].checked).toBe(false); // personnel_2
      expect(checkboxes[3].checked).toBe(true);  // personnel_3
    });
  });

  describe('Select All Functionality', () => {
    it('should select all personnel when Select All is clicked', () => {
      const onChangeMock = jest.fn();
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          onSelectedPersonnelChange={onChangeMock}
        />
      );

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(selectAllCheckbox);

      expect(onChangeMock).toHaveBeenCalledWith(['personnel_1', 'personnel_2', 'personnel_3']);
    });

    it('should deselect all personnel when Select All is clicked with all selected', () => {
      const onChangeMock = jest.fn();
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1', 'personnel_2', 'personnel_3']}
          onSelectedPersonnelChange={onChangeMock}
        />
      );

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(selectAllCheckbox);

      expect(onChangeMock).toHaveBeenCalledWith([]);
    });

    it('should show Select All as checked when all personnel selected', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1', 'personnel_2', 'personnel_3']}
        />
      );

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      expect(selectAllCheckbox.checked).toBe(true);
    });

    it('should show Select All as unchecked when not all personnel selected', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_1']}
        />
      );

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      expect(selectAllCheckbox.checked).toBe(false);
    });
  });

  describe('Disabled State', () => {
    it('should disable all checkboxes when disabled prop is true', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          disabled={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      checkboxes.forEach(checkbox => {
        expect(checkbox.disabled).toBe(true);
      });
    });

    it('should not call onChange when disabled checkbox is clicked', () => {
      const onChangeMock = jest.fn();
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          onSelectedPersonnelChange={onChangeMock}
          disabled={true}
        />
      );

      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);

      expect(onChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('Role Display', () => {
    it('should display role labels for each personnel', () => {
      render(<PersonnelSelectionSection {...defaultProps} />);

      // Check for role values displayed in parentheses (fallback from mock)
      expect(screen.getByText(/\(head_coach\)/i)).toBeInTheDocument();
      expect(screen.getByText(/\(assistant_coach\)/i)).toBeInTheDocument();
      expect(screen.getByText(/\(physio\)/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty selectedPersonnelIds array', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={[]}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      checkboxes.slice(1).forEach(checkbox => {
        expect(checkbox.checked).toBe(false);
      });
    });

    it('should handle personnel with minimal data (only required fields)', () => {
      const minimalPersonnel: Personnel[] = [{
        id: 'min_1',
        name: 'Minimal Coach',
        role: 'other',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }];

      render(
        <PersonnelSelectionSection
          {...defaultProps}
          availablePersonnel={minimalPersonnel}
        />
      );

      expect(screen.getByText('Minimal Coach')).toBeInTheDocument();
    });

    it('should handle single personnel member', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          availablePersonnel={[mockPersonnel[0]]}
        />
      );

      expect(screen.getByText('John Coach')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Total count
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels for checkboxes', () => {
      render(<PersonnelSelectionSection {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(4); // 1 Select All + 3 personnel
    });

    it('should maintain proper checkbox state for screen readers', () => {
      render(
        <PersonnelSelectionSection
          {...defaultProps}
          selectedPersonnelIds={['personnel_2']}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes[2].checked).toBe(true);
      expect(checkboxes[2].getAttribute('type')).toBe('checkbox');
    });
  });
});
