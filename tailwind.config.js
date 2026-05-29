/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        black: '#1A1A1A',
        white: '#ECECEC',

        // Warm-premium semantic palette. Each token ships a light value
        // (DEFAULT) + a `dark` variant — pair them with NativeWind's
        // `dark:` prefix, e.g. `bg-surface dark:bg-surface-dark`.
        // Neutrals are warm (ivory / sand / espresso) rather than the
        // cool Tailwind grays, for a calmer, more premium feel.
        canvas: { DEFAULT: '#F4F1EA', dark: '#15130E' }, // app background
        surface: { DEFAULT: '#FCFBF7', dark: '#1E1B15' }, // cards / raised
        clay: { DEFAULT: '#ECE6DA', dark: '#2A261E' }, // inset fills, tracks
        line: { DEFAULT: '#E5DFD3', dark: '#322D24' }, // hairline borders
        ink: { DEFAULT: '#2A2620', dark: '#F1ECE2' }, // primary text / dark btn
        muted: { DEFAULT: '#7B7366', dark: '#A69D8E' }, // secondary text
        faint: { DEFAULT: '#A79E90', dark: '#6F675A' }, // tertiary text
        accent: {
          DEFAULT: '#2EC4A5', // brand teal
          deep: '#1E9E84', // pressed / high-contrast
          soft: '#DBF1EB', // light tint background
          'soft-dark': '#16332C', // tint background (dark mode)
        },

        // Supporting semantic colors (warm-tuned). soft = state tint bg.
        danger: { DEFAULT: '#E0654F', soft: '#F6E4DF', 'soft-dark': '#3A1A14' }, // destructive / "still learning"
        'warm-amber': { DEFAULT: '#D9A441', soft: '#F6EAD2', 'soft-dark': '#332B16' }, // combo / "uncertain"
        frozen: { DEFAULT: '#6FA8DC' }, // calendar streak-freeze ring
      },
    },
  },
  plugins: [],
};
