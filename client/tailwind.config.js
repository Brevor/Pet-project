/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-subtle)',
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          soft: 'var(--brand-soft)'
        },
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)'
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.06)',
        pop: '0 12px 32px rgb(15 23 42 / 0.16)'
      }
    }
  },
  plugins: []
};