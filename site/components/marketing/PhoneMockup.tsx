import Image from 'next/image';
import React from 'react';

interface PhoneMockupProps {
  screenshot: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  style?: React.CSSProperties;
  zIndex?: number;
  imageFilter?: string;
  priority?: boolean;
  /** Show a "screenshot coming soon" placeholder instead of the image. */
  comingSoon?: boolean;
  comingSoonLabel?: string;
}

export default function PhoneMockup({
  screenshot,
  alt = 'App screenshot',
  size = 'md',
  className = '',
  style = {},
  zIndex = 0,
  imageFilter = 'contrast(1.075) saturate(1.025)',
  priority = false,
  comingSoon = false,
  comingSoonLabel = 'Screenshot coming soon',
}: PhoneMockupProps) {
  const sizes = {
    xs: { width: 60, height: 130 },
    sm: { width: 80, height: 173 },
    md: { width: 120, height: 260 },
    lg: { width: 160, height: 347 },
    xl: { width: 200, height: 433 },
    '2xl': { width: 240, height: 520 },
    '3xl': { width: 300, height: 650 },
  };

  const { width, height } = sizes[size];
  const borderRadius = size === 'xs' ? '1rem' : size === 'sm' ? '1.25rem' : '1.5rem';
  const innerRadius = size === 'xs' ? '0.75rem' : size === 'sm' ? '1rem' : '1.25rem';

  // Calculate aspect ratio for proportional scaling
  const aspectRatio = (width + 8) / (height + 8);

  return (
    <div
      className={`relative ${className}`}
      style={{
        width: width + 8,
        maxWidth: '100%',
        aspectRatio: `${aspectRatio}`,
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
        style={{ borderRadius: innerRadius, filter: comingSoon ? undefined : (imageFilter || undefined) }}
      >
        {comingSoon ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-slate-900 px-3 text-center">
            <svg className="h-6 w-6 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 leading-tight">{comingSoonLabel}</span>
          </div>
        ) : (
          <Image src={screenshot} alt={alt} fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" priority={priority} />
        )}
      </div>
    </div>
  );
}
