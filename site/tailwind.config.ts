import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class', // Use class-based dark mode (set by useEffect in _app.tsx)
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rajdhani', 'Inter', 'sans-serif'],
        display: ['Rajdhani', 'sans-serif'],
      },
      backgroundImage: {
        'noise-texture': "url('/noise.svg')",
      },
    },
  },
};

export default config;
