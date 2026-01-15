import Image from 'next/image';
import React from 'react';

interface PhoneMockupProps {
  screenshot: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  style?: React.CSSProperties;
  zIndex?: number;
  imageFilter?: string;
  priority?: boolean;
}

export default function PhoneMockup({
  screenshot,
  size = 'md',
  className = '',
  style = {},
  zIndex = 0,
  imageFilter = 'contrast(1.075) saturate(1.025)',
  priority = false,
}: PhoneMockupProps) {
  const sizes = {
    xs: { width: 60, height: 130 },
    sm: { width: 80, height: 173 },
    md: { width: 120, height: 260 },
    lg: { width: 160, height: 347 },
    xl: { width: 200, height: 433 },
    '2xl': { width: 240, height: 520 },
  };

  const { width, height } = sizes[size];
  const borderRadius = size === 'xs' ? '1rem' : size === 'sm' ? '1.25rem' : '1.5rem';
  const innerRadius = size === 'xs' ? '0.75rem' : size === 'sm' ? '1rem' : '1.25rem';

  return (
    <div
      className={`relative ${className}`}
      style={{
        width: width + 8,
        height: height + 8,
        background: 'linear-gradient(145deg, #3a3a3a, #1a1a1a)',
        borderRadius,
        padding: '4px',
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.1),
          0 25px 50px -12px rgba(0,0,0,0.7),
          0 0 60px -15px rgba(245, 158, 11, 0.2),
          inset 0 1px 1px rgba(255,255,255,0.1)
        `,
        zIndex,
        ...style,
      }}
    >
      {/* Camera hole */}
      {size !== 'xs' && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-gray-800"
          style={{
            width: size === 'sm' ? 4 : 6,
            height: size === 'sm' ? 4 : 6,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
        />
      )}
      {/* Screen */}
      <div
        className="relative w-full h-full overflow-hidden bg-black"
        style={{ borderRadius: innerRadius, filter: imageFilter || undefined }}
      >
        <Image src={screenshot} alt="App screenshot" fill sizes="(max-width: 768px) 100vw, 300px" className="object-cover" priority={priority} />
      </div>
    </div>
  );
}
