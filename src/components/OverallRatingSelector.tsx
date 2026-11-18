'use client';

import React from 'react';
import { chipStyle, chipSelectedStyle } from '@/styles/modalStyles';

interface OverallRatingSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const OverallRatingSelector: React.FC<OverallRatingSelectorProps> = ({ value, onChange }) => {
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    // Two even rows of five at any phone width, instead of whatever a
    // wrapping row happens to fit.
    <div className="grid grid-cols-5 gap-1.5">
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={n.toString()}
          aria-pressed={value === n}
          className={`${value === n ? chipSelectedStyle : chipStyle} min-w-11 justify-center`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
};

export default OverallRatingSelector;
