/**
 * Packages the Familiar Electron app using @electron/packager.
 *
 * Replaces `electron-forge package`. Produces a platform-native app bundle
 * (e.g. Familiar.app on macOS) in out/Familiar-<platform>-<arch>/.
 */

/* global process */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarDir = path.resolve(dirname, '..');

/**
 * Allowlist filter for files to include in the packaged app.
 * Everything not matching is excluded (node_modules, scripts, etc.).
 *
 * @param {string} filePath - Path relative to the app root.
 * @returns {boolean} True to include the file.
 */
const includeFilter = filePath => {
  // Allow the root
  if (filePath === '') return true;

  const allowed = [
    '/preload.js',
    '/package.json',
    '/bundles',
    '/dist',
    '/node',
    '/node.exe',
  ];

  for (const prefix of allowed) {
    if (filePath === prefix || filePath.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
};

const appPaths = await packager({
  dir: familiarDir,
  out: path.join(familiarDir, 'out'),
  overwrite: true,
  asar: false,
  name: 'Familiar',
  executableName: 'Familiar',
  icon: path.join(familiarDir, 'assets/icon'),
  platform: /** @type {any} */ (process.platform === 'win32' ? 'win32' : process.platform),
  arch: process.arch,
  ignore: contents => !includeFilter(contents),
});

console.log(`Packaged app at: ${appPaths[0]}`);
