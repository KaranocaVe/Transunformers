import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,mjs,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        display: ["Outfit", "sans-serif"],
      },
      colors: {
        // Semantic Application Colors (mapped to CSS variables)
        bg: "var(--color-bg)",
        "panel-bg": "var(--color-panel)",
        "panel-border": "var(--color-border)",

        // Text
        "text-main": "var(--color-text-main)",
        "text-muted": "var(--color-text-muted)",
        "text-dim": "var(--color-text-dim)",

        // Brand/Action
        "brand-primary": "var(--color-brand-primary)",
        "brand-hover": "var(--color-brand-hover)",

        // Compatibility for specific UI components if needed
        border: "var(--color-border)",
        input: "var(--color-input)",
        ring: "var(--color-ring)",
      },
    },
  },
  plugins: [],
};
