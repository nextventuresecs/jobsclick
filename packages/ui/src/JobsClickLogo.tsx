import React from 'react';

export type LogoVariant = 'full' | 'icon' | 'monochrome' | 'dark';
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface JobsClickLogoProps {
  readonly variant?: LogoVariant;
  readonly className?: string;
  readonly size?: LogoSize;
  readonly showTagline?: boolean;
}

const HEIGHT_CLASSES: Record<LogoSize, string> = {
  sm: 'h-7',
  md: 'h-9',
  lg: 'h-11',
  xl: 'h-14',
} as const;

export const JobsClickLogo: React.FC<JobsClickLogoProps> = ({
  variant = 'full',
  className = '',
  size = 'md',
  showTagline = false,
}) => {
  const isDark = variant === 'dark';
  const isMono = variant === 'monochrome';
  const isIcon = variant === 'icon';
  const heightClass = HEIGHT_CLASSES[size];

  if (isIcon) {
    return (
      <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>
        <svg
          viewBox="0 0 100 100"
          className={`${heightClass} w-auto aspect-square`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="JobsClick Symbol"
        >
          <defs>
            <linearGradient id="iconJGrad" x1="20" y1="15" x2="65" y2="85" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FB923C" />
              <stop offset="50%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
          </defs>
          <path
            d="M52 24 C52 19 48 16 43 19 L26 29 C22 31 20 36 20 40 L20 62 C20 74 12 80 5 80 C2 80 0 76 0 83 C0 89 7 94 17 94 C33 94 44 82 44 67 L44 26 Z"
            fill={isMono ? '#1F2937' : 'url(#iconJGrad)'}
            transform="translate(8, 0)"
          />
          <path
            d="M60 24 L60 66 C60 83 45 96 26 96 C11 96 2 86 2 79 C2 72 8 68 14 68 C19 68 23 71 27 71 C34 71 39 66 39 58 L39 41 L60 24 Z"
            fill={isMono ? '#374151' : 'url(#iconJGrad)'}
            transform="translate(8, 0)"
          />
          <path
            d="M72 23 C72 18 78 15 82 17 L97 28 C100 30 100 36 97 38 L82 49 C78 51 72 48 72 43 Z"
            fill={isMono ? '#4B5563' : '#FBBF24'}
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        viewBox="0 0 320 80"
        className={`${heightClass} w-auto`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="JobsClick Logo"
      >
        <defs>
          <linearGradient id="fullLogoJGrad" x1="15" y1="10" x2="55" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
        </defs>

        {/* J Ribbon */}
        <g transform="translate(4, 4)">
          <path
            d="M44 18 C44 14 41 12 37 14 L22 23 C19 25 17 28 17 32 L17 50 C17 60 10 65 5 65 C2 65 0 62 0 67 C0 72 6 76 14 76 C27 76 36 67 36 54 L36 20 Z"
            fill={isMono ? '#1F2937' : 'url(#fullLogoJGrad)'}
          />
          <path
            d="M50 18 L50 52 C50 66 38 77 22 77 C9 77 2 69 2 63 C2 58 7 54 12 54 C16 54 19 57 23 57 C29 57 33 53 33 46 L33 32 L50 18 Z"
            fill={isMono ? '#374151' : 'url(#fullLogoJGrad)'}
          />
          <path
            d="M58 17 C58 13 63 10 66 12 L78 21 C81 23 81 27 78 29 L66 38 C63 40 58 37 58 33 Z"
            fill={isMono ? '#4B5563' : '#FBBF24'}
          />
        </g>

        {/* Wordmark */}
        <text
          x="100"
          y="56"
          fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
          fontSize="46"
          fontWeight="800"
          letterSpacing="-1"
        >
          <tspan fill={isDark ? '#FFFFFF' : isMono ? '#1F2937' : '#1F2937'}>Jobs</tspan>
          <tspan fill={isMono ? '#4B5563' : '#F97316'}>Click</tspan>
        </text>
      </svg>
      {showTagline && (
        <span className="hidden sm:inline-block border-l border-gray-300 pl-2 text-xs font-medium text-gray-500">
          Jobs & MSME Portal
        </span>
      )}
    </div>
  );
};
