/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
          light: '#FCD34D'
        },
        gold: {
          DEFAULT: '#F59E0B',
          dark: '#D97706',
          light: '#FCD34D'
        },
        dark: {
          DEFAULT: '#0A0A0A',
          card: '#141414',
          border: '#2A2A2A',
          hover: '#1A1A1A'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'sans-serif']
      },
      direction: ['rtl']
    }
  },
  plugins: []
};
