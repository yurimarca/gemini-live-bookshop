/**
 * Single source of truth for all UI colors.
 * Change theme by editing this file; Tailwind and index.css consume these values.
 *
 * Semantic tokens:
 * - background / surface: page and card backgrounds
 * - text: primary (headings, body), muted (secondary), inverse (on dark backgrounds)
 * - border: default and strong
 * - primary: main brand (buttons, links); onPrimary: text/icon on primary (always readable)
 * - status: success, error, warning, info for feedback and states
 */

export const themeColors = {
  // --- Neutrals (mist scale) ---
  mist: {
    50: '#fefefe',
    100: '#f5f0ef',
    200: '#e6dfdf',
    300: '#d4caca',
    600: '#8d8e91',
    700: '#616160',
    900: '#201d1b',
  },

  // --- Brand ---
  brand: {
    red: '#ce4532',
    coral: '#e97b62',
    charcoal: '#201d1b',
  },

  // --- Semantic: backgrounds ---
  background: {
    page: '#fefefe',
    card: 'rgba(32, 29, 27, 0.05)',
    cardHover: 'rgba(32, 29, 27, 0.08)',
    input: 'rgba(245, 240, 239, 0.5)',
    subtle: 'rgba(32, 29, 27, 0.05)',
  },

  // --- Semantic: text (guaranteed contrast on background.page / background.card) ---
  text: {
    primary: '#201d1b',
    secondary: '#616160',
    muted: '#8d8e91',
    /** Use on primary-colored buttons/backgrounds so text is always readable */
    onPrimary: '#ffffff',
  },

  // --- Semantic: borders ---
  border: {
    default: 'rgba(32, 29, 27, 0.1)',
    strong: 'rgba(32, 29, 27, 0.2)',
  },

  // --- Semantic: primary (brand) ---
  primary: {
    DEFAULT: '#ce4532',
    light: '#e97b62',
    /** Text/icon on primary buttons; change with primary for contrast */
    foreground: '#ffffff',
  },

  // --- Semantic: status (feedback, alerts) ---
  success: {
    DEFAULT: '#10b981',
    light: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.2)',
    foreground: '#047857',
  },
  error: {
    DEFAULT: '#ef4444',
    light: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.2)',
    foreground: '#b91c1c',
    /** Dark background for error toasts */
    surface: 'rgba(127, 29, 29, 0.9)',
    surfaceText: '#fecaca',
  },
  warning: {
    DEFAULT: '#f59e0b',
    light: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.2)',
    foreground: '#b45309',
  },
  info: {
    DEFAULT: '#6366f1',
    light: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.2)',
  },

  // --- UI specifics (scrollbar, overlays) ---
  scrollbar: {
    track: '#fefefe',
    thumb: '#e6dfdf',
    thumbHover: '#ce4532',
  },

  /** Overlay on images (e.g. book card hover) */
  overlay: {
    dark: 'rgba(0, 0, 0, 0.8)',
  },
} as const;

export type ThemeColors = typeof themeColors;
