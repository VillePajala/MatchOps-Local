import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class', // Use class-based dark mode
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-rajdhani)', 'Inter', 'sans-serif'],
        display: ['var(--font-rajdhani)', 'sans-serif'],
      },
    },
  },
};

export default config;
