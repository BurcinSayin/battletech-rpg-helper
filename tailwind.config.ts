import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // shadcn/ui CSS-variable theme is wired here as components are added.
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Dark "HUD" palette for the character editor (docs/design wireframe):
        // monospace, near-black panels, amber accent.
        hud: {
          bg: "#0a0a0b",
          panel: "#141416",
          raised: "#1c1c1f",
          line: "#2a2a2e",
          text: "#e8e6e3",
          muted: "#8a8a90",
          amber: "#e0a82e",
          green: "#5fcf80",
          red: "#f0716a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
