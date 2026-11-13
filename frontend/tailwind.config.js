/** @type {import('tailwindcss').Config} */
import { themeColors } from './src/theme/colors.config.ts';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        ...themeColors,
        // Convenience: primary and on-primary for buttons/links
        primary: {
          DEFAULT: themeColors.brand.red,
          light: themeColors.brand.coral,
          foreground: themeColors.text.onPrimary,
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'float': 'float 6s ease-in-out infinite',
        'capability-highlight': 'capabilityHighlight 1.6s cubic-bezier(0.34, 1.2, 0.64, 1) forwards',
        'widget-attention': 'widgetAttention 2s ease-out forwards',
        'gradient-x': 'gradientX 5s ease infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        capabilityHighlight: {
          '0%': {
            transform: 'scale(1) translateY(0)',
            boxShadow: '0 0 0 1px rgba(32,29,27,0.06), 0 4px 6px -1px rgba(0,0,0,0.08)',
            opacity: '1',
          },
          '25%': {
            transform: 'scale(1.02) translateY(-2px)',
            boxShadow: '0 0 0 1px rgba(206, 69, 50, 0.2), 0 0 24px 4px rgba(206, 69, 50, 0.12), 0 8px 16px -4px rgba(0,0,0,0.1)',
            opacity: '1',
          },
          '45%': {
            transform: 'scale(1.04) translateY(-4px)',
            boxShadow: '0 0 0 2px rgba(206, 69, 50, 0.4), 0 0 40px 8px rgba(206, 69, 50, 0.15), 0 0 80px 16px rgba(206, 69, 50, 0.06), 0 12px 24px -4px rgba(0,0,0,0.12)',
            opacity: '1',
          },
          '70%': {
            transform: 'scale(1.03) translateY(-2px)',
            boxShadow: '0 0 0 1px rgba(206, 69, 50, 0.25), 0 0 28px 6px rgba(206, 69, 50, 0.1), 0 8px 20px -4px rgba(0,0,0,0.1)',
            opacity: '1',
          },
          '100%': {
            transform: 'scale(1) translateY(0)',
            boxShadow: '0 0 0 1px rgba(32,29,27,0.06), 0 4px 6px -1px rgba(0,0,0,0.08)',
            opacity: '1',
          },
        },
        widgetAttention: {
          '0%': { boxShadow: '0 0 0 0 rgba(206, 69, 50, 0.7)' },
          '50%': { boxShadow: '0 0 0 12px rgba(206, 69, 50, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(206, 69, 50, 0)' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
    },
  },
  plugins: [
    function ({ addBase, theme }) {
      addBase({
        '::-webkit-scrollbar': { width: '8px' },
        '::-webkit-scrollbar-track': { background: theme('colors.scrollbar.track') },
        '::-webkit-scrollbar-thumb': {
          background: theme('colors.scrollbar.thumb'),
          borderRadius: '4px',
        },
        '::-webkit-scrollbar-thumb:hover': {
          background: theme('colors.scrollbar.thumbHover'),
        },
      });
    },
  ],
};
