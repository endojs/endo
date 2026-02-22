/**
 * Bundles the Endo CLI and gateway server into self-contained CJS files
 * using esbuild for inclusion in the packaged Electron app.
 */

import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(familiarRoot, '../..');

/**
 * esbuild plugin that replaces `import.meta.url` with a CJS equivalent.
 * In CJS, `import.meta` is empty so any `new URL(..., import.meta.url)`
 * calls fail with "Invalid URL". This injects a `__filename`-based URL
 * that works in bundled CJS output.
 */
const importMetaPlugin = {
  name: 'import-meta-url',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /\.[cm]?[jt]s$/ }, async args => {
      const { readFile } = await import('fs/promises');
      let contents = await readFile(args.path, 'utf8');
      // Replace import.meta.url with a CJS-compatible file URL.
      // The bundle is a single file so __filename is correct.
      if (contents.includes('import.meta.url')) {
        contents = contents.replaceAll(
          'import.meta.url',
          'require("url").pathToFileURL(__filename).href',
        );
        return { contents, loader: args.path.endsWith('.ts') ? 'ts' : 'js' };
      }
      return undefined;
    });
  },
};

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // SES lockdown requires strict mode; CJS files aren't strict by default.
  banner: { js: "'use strict';" },
  // Node built-ins are external by default with platform: 'node'.
  // Mark optional native deps as external to avoid build failures.
  external: ['bufferutil', 'utf-8-validate'],
  plugins: [importMetaPlugin],
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/cli/bin/endo.cjs')],
  outfile: path.join(familiarRoot, 'bundles/endo-cli.cjs'),
});

await build({
  ...shared,
  entryPoints: [
    path.join(repoRoot, 'packages/chat/scripts/gateway-server.js'),
  ],
  outfile: path.join(familiarRoot, 'bundles/gateway-server.cjs'),
});

await build({
  ...shared,
  entryPoints: [
    path.join(repoRoot, 'packages/daemon/src/daemon-node.js'),
  ],
  outfile: path.join(familiarRoot, 'bundles/endo-daemon.cjs'),
});

await build({
  ...shared,
  entryPoints: [
    path.join(repoRoot, 'packages/daemon/src/web-server-node.js'),
  ],
  outfile: path.join(familiarRoot, 'bundles/endo-worker.cjs'),
});

console.log('Bundles created in packages/familiar/bundles/');
