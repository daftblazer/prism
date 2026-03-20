/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: { DEFAULT: 'rgb(var(--void-rgb) / <alpha-value>)', warm: 'rgb(var(--void-warm-rgb) / <alpha-value>)', panel: 'rgb(var(--void-panel-rgb) / <alpha-value>)', raised: 'rgb(var(--void-raised-rgb) / <alpha-value>)' },
        nerv: { DEFAULT: 'rgb(var(--nerv-orange-rgb) / <alpha-value>)', dim: 'rgb(var(--nerv-orange-dim-rgb) / <alpha-value>)', hot: 'rgb(var(--nerv-orange-hot-rgb) / <alpha-value>)' },
        'data-green': { DEFAULT: 'rgb(var(--data-green-rgb) / <alpha-value>)', dim: 'rgb(var(--data-green-dim-rgb) / <alpha-value>)' },
        'wire-cyan': { DEFAULT: 'rgb(var(--wire-cyan-rgb) / <alpha-value>)', dim: 'rgb(var(--wire-cyan-dim-rgb) / <alpha-value>)' },
        'alert-red': { DEFAULT: 'rgb(var(--alert-red-rgb) / <alpha-value>)', dim: 'rgb(var(--alert-red-dim-rgb) / <alpha-value>)', hot: 'rgb(var(--alert-red-hot-rgb) / <alpha-value>)' },
        steel: { DEFAULT: 'rgb(var(--steel-rgb) / <alpha-value>)', dim: 'rgb(var(--steel-dim-rgb) / <alpha-value>)' },
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
