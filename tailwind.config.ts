import type { Config } from "tailwindcss";
import rtl from "tailwindcss-rtl";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "var(--brand-primary)",
          sky: "var(--brand-secondary)",
          orange: "var(--brand-accent)",
          "orange-light": "var(--brand-accent-light)",
        },
      },
    },
  },
  plugins: [rtl],
};
export default config;
