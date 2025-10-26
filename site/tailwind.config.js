/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F59E0B', // Amber 500 - matches app yellow
          dark: '#D97706', // Amber 600
          light: '#FCD34D', // Amber 300
        },
        secondary: {
          DEFAULT: '#1F2937', // Gray 800
          dark: '#111827', // Gray 900
          light: '#374151', // Gray 700
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
