/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme')

// Colours are the design tokens in app/[locale]/globals.css (docs/design/v2/css/tokens.css). They are CSS variables so a
// `.theme-dark` ancestor switches a whole section, including the product windows inside it, without a second class set.
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class', // or 'media' or 'class'
  variants: {
    extend: {},
  },
  theme: {
    extend: {
      colors: {
        canvas: { DEFAULT: 'var(--site-canvas)', 2: 'var(--site-canvas-2)' },
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        fg: { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)', 3: 'var(--fg-3)', 4: 'var(--fg-4)' },
        line: { DEFAULT: 'var(--line)', 2: 'var(--line-2)' },
        brand: { DEFAULT: 'var(--brand)', text: 'var(--brand-text)', fg: 'var(--brand-fg)' },
        ink: 'var(--ink)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        type: { clip: 'var(--t-clip)', highlight: 'var(--t-highlight)', screenshot: 'var(--t-screenshot)' },
      },
      boxShadow: {
        window: 'var(--sh-window)',
        pop: 'var(--sh-2)',
        card: 'var(--sh-1)',
      },
      borderRadius: {
        // Product windows never exceed 8px (docs/v2/website.md §5).
        window: '8px',
      },
      maxWidth: {
        page: '1240px',
      },
    },
    fontFamily: {
      sans: ['var(--font-ui)', ...defaultTheme.fontFamily.sans],
      serif: ['var(--font-serif)', ...defaultTheme.fontFamily.serif],
      mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
    },
  },
  plugins: [require('@tailwindcss/aspect-ratio')],
}
