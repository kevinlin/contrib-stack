import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ContribStack",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    outDir: "dist",
    minify: "esbuild",
  },
});
