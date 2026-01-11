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
    rollupOptions: {
      input: {
        main: './index.html',
        'monaco-iframe': './monaco-iframe.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  optimizeDeps: {
    // Don't pre-bundle monaco - it's loaded in a separate iframe entry
    exclude: ['monaco-editor'],
  },
});
