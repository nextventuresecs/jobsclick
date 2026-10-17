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
      colors: {
        brand: {
          orange: '#F97316',
          'orange-hover': '#EA580C',
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
          text: '#6B7280',
          muted: '#9CA3AF',
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
