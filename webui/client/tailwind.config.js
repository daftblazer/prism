/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: { DEFAULT: '#000000', warm: '#080807', panel: '#0C0C0A', raised: '#111110' },
        nerv: { DEFAULT: '#FF9830', dim: '#C87020', hot: '#FFCC50' },
        'data-green': { DEFAULT: '#50FF50', dim: '#30BB30' },
        'wire-cyan': { DEFAULT: '#20F0FF', dim: '#10A0B0' },
        'alert-red': { DEFAULT: '#FF3030', dim: '#CC2020', hot: '#FF5050' },
        steel: { DEFAULT: '#D8D8D0', dim: '#888880' },
      },
      fontFamily: {
        title: ['"Noto Serif Display"', '"Times New Roman"', 'serif'],
        mincho: ['"Shippori Mincho B1"', '"YuMincho"', 'serif'],
        sys: ['"JetBrains Mono"', '"Cascadia Mono"', '"Consolas"', 'monospace'],
        stamp: ['"Saira Extra Condensed"', '"Impact"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
