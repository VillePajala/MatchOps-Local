/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '../utils/test-utils';

// Simple smoke test component to verify core functionality
const SmokeTestComponent = () => (
  <div data-testid="smoke-test">
    <h1>Smoke Test</h1>
    <button data-testid="test-button">Click Me</button>
    <input data-testid="test-input" placeholder="Type here" />
  </div>
);

describe('Component Smoke Tests', () => {
  it('should render components without crashing', () => {
    render(<SmokeTestComponent />);
    
    expect(screen.getByTestId('smoke-test')).toBeInTheDocument();
    expect(screen.getByText('Smoke Test')).toBeInTheDocument();
    expect(screen.getByTestId('test-button')).toBeInTheDocument();
    expect(screen.getByTestId('test-input')).toBeInTheDocument();
  });

  it('should handle basic interactions', () => {
    render(<SmokeTestComponent />);
    
    const button = screen.getByTestId('test-button');
    const input = screen.getByTestId('test-input');
    
    // Should not crash on interactions
    expect(() => button.click()).not.toThrow();
    expect(() => input.focus()).not.toThrow();
  });

  it('should clean up properly', () => {
    const { unmount } = render(<SmokeTestComponent />);
    
    expect(screen.getByTestId('smoke-test')).toBeInTheDocument();
    
    // Should unmount without errors
    expect(() => unmount()).not.toThrow();
    
    // Should be gone after unmount
    expect(screen.queryByTestId('smoke-test')).not.toBeInTheDocument();
  });
});