/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        bg: '#000000',
        fg: '#FFFFFF',
        muted: '#9A9A9A',
      },
    },
  },
  plugins: [],
};
