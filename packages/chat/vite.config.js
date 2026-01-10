import { defineConfig } from 'vite';
import { makeEndoPlugin } from './vite-endo-plugin.js';

export default defineConfig({
  plugins: [
    // Start a temporary Endo daemon for development
    makeEndoPlugin({
      port: 0, // Host-assigned port
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
