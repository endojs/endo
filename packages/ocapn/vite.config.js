// @ts-check
/// <reference types="vite" />

import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { htmlScriptInsertPlugin } from './scripts/html-script-insert-plugin.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const sourceDir = path.resolve(dirname, 'src/web');

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    root: dirname,
    build: {
      assetsDir: '',
      emptyOutDir: false,
      // Disable Vite's module preload, which may cause SES-dependent code to run before lockdown.
      modulePreload: false,
      outDir: path.resolve(dirname, 'dist/web'),
      minify: !isDev,
      sourcemap: isDev ? 'inline' : false,
      rollupOptions: {
        external: ['./endoify.js'],
        input: {
          index: path.resolve(sourceDir, 'index.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
    plugins: [
      htmlScriptInsertPlugin('/endoify.js'),
      {
        name: 'move-html-files-to-root',
        generateBundle: {
          order: 'post',
          handler(_, bundle) {
            for (const chunk of Object.values(bundle)) {
              if (chunk.fileName.endsWith('.html')) {
                chunk.fileName = path.basename(chunk.fileName);
              }
            }
          },
        },
      },
    ],
  };
});