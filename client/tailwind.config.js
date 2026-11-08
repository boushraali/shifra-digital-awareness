/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'] },
      colors: {
        nova: { 50: '#f3f1ff', 100: '#e9e5ff', 200: '#d5cdff', 300: '#b6a6ff', 400: '#9274ff', 500: '#7444ff', 600: '#6422f7', 700: '#5517e0', 800: '#4614b8', 900: '#3b1496', 950: '#1c0a4d' },
        ink: { 900: '#0b0a1f', 800: '#121130', 700: '#1b1a44' },
      },
      boxShadow: { glow: '0 0 40px -8px rgba(116,68,255,.55)', card: '0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.08)' },
      keyframes: { float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } } },
      animation: { float: 'float 5s ease-in-out infinite' },
    },
  },
  plugins: [],
}
