import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light Theme (Orch.io design system)
        dark: {
          950: '#f8fafc',    /* lightest bg - slate-50 */
          900: '#f1f5f9',    /* light bg - slate-100 */
          850: '#e2e8f0',    /* borders area - slate-200 */
          800: '#cbd5e1',    /* heavier borders - slate-300 */
          700: '#94a3b8',    /* muted elements - slate-400 */
          600: '#64748b',    /* secondary text - slate-500 */
          500: '#475569',    /* darker text - slate-600 */
        },
        // Brand Colors - Ocean Blue
        'ocean-blue': '#3b82f6',
        'ocean-dark': '#2563eb',
        'ocean-light': '#60a5fa',
        // Brand Colors - Warm Orange
        'warm-orange': '#f97316',
        'warm-dark': '#ea580c',
        'warm-light': '#fb923c',
        // Primary (Blue)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Secondary (Orange)
        secondary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Status Colors
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        rose: '#f43f5e',
      },
      fontFamily: {
        sans: ['Prompt', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
