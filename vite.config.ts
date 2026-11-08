import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Python pipeline writes JSON to public/data, which Vite serves as-is at /data.
// BASE_PATH is set by the deploy workflow, since GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
