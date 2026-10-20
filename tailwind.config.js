/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 700: '#173570', 800: '#0f2552', 900: '#0a1a3a', 950: '#06122b' },
      },
      fontFamily: { sans: ['Be Vietnam Pro', 'system-ui', 'sans-serif'] },
      keyframes: {
        pulseGlow: { '0%,100%': { opacity: '.6' }, '50%': { opacity: '1' } },
        floatUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'none', opacity: '1' } },
      },
      animation: { glow: 'pulseGlow 2.4s ease-in-out infinite', rise: 'floatUp .35s ease-out both' },
    },
  },
  plugins: [],
};
