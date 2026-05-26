import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Terminal / war-room palette
        ink: {
          DEFAULT: "#05070a", // page background
          900: "#05070a",
          800: "#0a0e14",
          700: "#11161f",
          600: "#1a212d",
          500: "#252e3d",
        },
        signal: {
          high: "#ff4d5e", // urgent / threat
          mid: "#ffb020", // watch
          low: "#3ddc97", // opportunity / good
          info: "#3aa0ff", // neutral intel
        },
        accent: {
          DEFAULT: "#3ddc97",
          glow: "#3ddc9733",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px #3ddc9733, 0 0 24px -6px #3ddc9755",
        "glow-red": "0 0 0 1px #ff4d5e33, 0 0 24px -6px #ff4d5e55",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
        fadeUp: "fadeUp 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
