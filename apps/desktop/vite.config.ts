import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  server: {
    allowedHosts: ["filebutler.monkeymagic.co"],
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
});
