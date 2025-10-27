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
        sans: ['Rajdhani', 'Inter', 'sans-serif'],
        display: ['Rajdhani', 'sans-serif'],
      },
    },
  },
};

export default config;
