/* global process */
import { fileURLToPath } from 'url';
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { makeEndoPlugin } from './vite-endo-plugin.js';

export default defineConfig({
  plugins: [makeEndoPlugin(), react()],
  base: './',
  resolve: {
    alias: {
      // `@endo/platform/fs/extended` reaches `node:crypto` through its content-
      // addressed snapshot helper. The file explorer never
      // materialises snapshots, so a small browser stand-in keeps
      // the bundle buildable without pulling a Node polyfill.
      'node:crypto': fileURLToPath(
        new URL('./node-crypto-shim.js', import.meta.url),
      ),
    },
  },
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
    // Allow access through a reverse proxy (e.g. `tailscale serve`) that
    // forwards the tailnet hostname. Defaults to any *.ts.net MagicDNS host;
    // override with a comma-separated VITE_ALLOWED_HOSTS.
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',')
      : ['.ts.net'],
  },
});
