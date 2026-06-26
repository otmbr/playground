import { defineConfig } from "vite";

// GRAVASTAR LAB build configuration.
// Base is "./" so the built PWA works when served from a subdirectory
// (e.g. GitHub Pages project sites).
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
  },
});
