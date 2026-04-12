/* global process */
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
    port: process.env.VITE_PORT ? Number(process.env.VITE_PORT) : 5173,
    strictPort: false,
  },
});
