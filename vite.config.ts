import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base keeps the app working when Hugging Face Static Spaces serves it
// from a sub-path, not only from a domain root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
