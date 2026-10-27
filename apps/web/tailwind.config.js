/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-devanagari)', 'system-ui', 'sans-serif'],
        devanagari: ['var(--font-devanagari)', 'var(--font-inter)', 'sans-serif'],
      },
      colors: {
        brand: {
          orange: '#C2410C',
          'orange-hover': '#9A3412',
          'orange-light': '#FFF0E5',
          yellow: '#FBBF24',
          'yellow-light': '#FFFBEB',
        },
        charcoal: {
          DEFAULT: '#1F2937',
          dark: '#111827',
        },
        gray: {
          light: '#E5E7EB',
          soft: '#F3F4F6',
          text: '#374151',
          muted: '#6B7280',
          surface: '#F9FAFB',
        },
        success: '#15803D',
        warning: '#B45309',
        error: '#DC2626',
        info: '#475569',
      },
    },
  },
  plugins: [],
};
