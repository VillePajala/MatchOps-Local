const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-rajdhani)', 'Inter', 'sans-serif'],
        display: ['var(--font-rajdhani)', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'noise-texture': "url('/noise.svg')",
      },
      colors: {
        'app': {
          950: 'var(--app-bg-darkest)',   // Deep purple-black
          900: 'var(--app-bg-dark)',      // Dark purple
          800: 'var(--app-bg-medium)',    // Medium purple
          700: 'var(--app-bg-light)',     // Purple-indigo
          600: 'var(--app-bg-lighter)',   // Lighter purple
          500: 'var(--app-bg-lightest)',  // Accent purple
        }
      }
    },
  },
  plugins: [],
  safelist: [
    'animate-pulse',
    'animate-fade-in-out',
  ],
}