/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // POWER 111 brand gold. One accent system for the whole product: gold for
        // actions, active navigation and the numbers that matter.
        primary: {
          DEFAULT: '#FFC629',
          dark: '#F5A000',
          light: '#FFD95C'
        },
        gold: {
          DEFAULT: '#FFC629',
          dark: '#F5A000',
          light: '#FFD95C'
        },
        dark: {
          DEFAULT: '#090909',   // app background
          nav: '#101010',       // sidebar and top navigation
          card: '#151515',      // standard card
          elevate: '#1B1B1B',   // raised surface
          hover: '#1B1B1B',
          // rgba(255,255,255,0.08) exactly as it composites on the cards above.
          border: '#282828'
        },
        // The neutral text ramp for the dark surfaces. The printed receipt and the
        // member card keep Tailwind's own grays — they sit on white paper.
        gray: {
          400: '#B9B9B9',
          500: '#A3A3A3',
          600: '#8A8A8A',
          700: '#6E6E6E'
        },
        // One restrained red for "money out" and errors. Emerald already sits at the
        // restrained green the identity uses, so only the red needed pulling back.
        rose: {
          200: '#FACFCF',
          300: '#F7A9A9',
          400: '#F26D6D',
          500: '#E04F4F'
        },
        // The warning ramp is the brand gold ramp — expiring subscriptions and the
        // "act today" pills are the same family as the logo, not a second yellow.
        amber: {
          200: '#FFE9A8',
          300: '#FFD95C',
          400: '#FFC629',
          500: '#F5A000',
          600: '#D98A00'
        },
        yellow: {
          400: '#FFC629',
          500: '#F5A000'
        },
        // One restrained green for "money in" and live presence — the same value the
        // shared kit uses, so a success pill never has two shades to pick from.
        emerald: {
          300: '#6EE7B7',
          400: '#34D399',
          500: '#1FBD85',
          600: '#159868'
        },
        // red is the same error as rose, not a third one.
        red: {
          300: '#F7A9A9',
          400: '#F26D6D',
          500: '#E04F4F'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'sans-serif']
      },
      keyframes: {
        pageIn: {
          from: { opacity: '0', transform: 'translate3d(0, 8px, 0)' },
          to: { opacity: '1', transform: 'none' }
        },
        modalIn: {
          from: { opacity: '0', transform: 'translate3d(0, 10px, 0) scale(.99)' },
          to: { opacity: '1', transform: 'none' }
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        }
      },
      animation: {
        'page-in': 'pageIn 260ms cubic-bezier(.16,.84,.44,1) both',
        'modal-in': 'modalIn 220ms cubic-bezier(.16,.84,.44,1) both',
        'fade-in': 'fadeIn 160ms ease-out both'
      },
      direction: ['rtl']
    }
  },
  plugins: []
};
