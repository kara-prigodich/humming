import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1d4ed8",
          green: "#15803d",
          yellow: "#a16207",
          orange: "#c2410c",
          purple: "#7e22ce",
          red: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
