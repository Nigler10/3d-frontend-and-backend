import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactDraggable3dCompat } from "./build/reactDraggable3dCompat.js";

export default defineConfig({
  plugins: [reactDraggable3dCompat(), react()],
  optimizeDeps: {
    rolldownOptions: { plugins: [reactDraggable3dCompat()] },
  },
});
