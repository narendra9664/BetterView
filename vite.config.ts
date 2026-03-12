import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],

  optimizeDeps: {
    // Pre-bundle Three.js extras so dynamic imports resolve instantly
    include: [
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "three/examples/jsm/exporters/GLTFExporter.js",
    ],
  },

  build: {
    rollupOptions: {
      // Removed manualChunks to avoid SSR build conflicts with Three.js
    },
  },
});
