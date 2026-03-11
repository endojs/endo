// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { makeEndoPlugin } from './vite-endo-plugin.js';

export default defineConfig({
  plugins: [makeEndoPlugin(), react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
