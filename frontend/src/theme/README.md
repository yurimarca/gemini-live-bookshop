# Theme & colors

All UI colors are defined in **`colors.config.ts`** and used by Tailwind and components.

## Changing the theme

1. Edit **`src/theme/colors.config.ts`**.
2. Update the tokens you need:
   - **`mist`** – neutral grays (backgrounds, borders, muted text).
   - **`brand`** – red, coral, charcoal (primary actions, links, accents).
   - **`text.onPrimary`** – text/icon on primary-colored buttons (must contrast with `brand.red` / `brand.coral`). If you change brand to a light color, set this to a dark color (e.g. `#201d1b`).
   - **`success`**, **`error`**, **`warning`**, **`info`** – status colors for feedback and alerts.

3. Rebuild; no other files need changes. Components use semantic names (`text-primary-foreground`, `bg-success`, `bg-error`, etc.), so they follow the config.

## Token usage

| Token | Usage |
|-------|--------|
| `mist-50` … `mist-900` | Page/card backgrounds, borders, body text |
| `brand-red`, `brand-coral`, `brand-charcoal` | Buttons, links, prices, accents |
| `text-primary-foreground` | Text and icons on primary buttons (replaces hardcoded `text-white`) |
| `success` / `success-light` / `success-foreground` | Success states, confirmations |
| `error` / `error-light` / `error-foreground` / `error-surface` | Errors, destructive actions, toasts |
| `warning` / `warning-light` / `warning-foreground` | Warnings, connecting states |
| `info` | Neutral info (e.g. demo buttons) |
| `overlay-dark` | Dark overlay on images (e.g. book card hover) |

## Adding dark mode later

1. In `colors.config.ts`, export a second set of tokens (e.g. `themeColorsDark`).
2. In `index.css`, define a `.dark` (or `[data-theme="dark"]`) scope and set CSS variables or use Tailwind’s dark mode with the dark palette.
3. In `tailwind.config.js`, enable `darkMode: 'class'` (or `'media'`) and add dark variants for the theme colors.
4. Toggle the class or attribute from your app (e.g. theme context or a switch).

All components already use semantic names, so switching to dark only requires mapping those names to the dark palette.
