import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13201b",
        paper: "#f8faf7",
        moss: "#1f6f5b",
        coral: "#ef6f61",
        skyline: "#e7f2ee",
        line: "#cad8d2"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        calm: "0 18px 45px rgba(19, 32, 27, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;

