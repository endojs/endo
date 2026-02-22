// @ts-check

// CommonJS because the package uses "type": "module" but Forge requires CJS config.

const path = require('path'); // eslint-disable-line @typescript-eslint/no-require-imports
const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Copy @endo/where into the packaged app's node_modules.
 * This is needed because @endo/where is a workspace dependency resolved
 * via Yarn hoisting, which flora-colossus (Forge's dependency walker)
 * cannot resolve from the package-local node_modules.
 *
 * @param {string} buildPath
 * @param {string} _electronVersion
 * @param {string} _platform
 * @param {string} _arch
 * @param {Function} callback
 */
const copyEndoWhere = (
  buildPath,
  _electronVersion,
  _platform,
  _arch,
  callback,
) => {
  const src = path.resolve(__dirname, '../../node_modules/@endo/where');
  const dest = path.join(buildPath, 'node_modules', '@endo', 'where');
  fs.cpSync(src, dest, { recursive: true });
  callback();
};

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    asar: false,
    name: 'Familiar',
    executableName: 'Familiar',
    icon: path.resolve(__dirname, 'assets/icon'),
    ignore: contents => {
      // Allow the root (empty string)
      if (contents === '') return false;

      // Allowlist of paths to include in the packaged app
      const allowed = [
        '/electron-main.js',
        '/preload.js',
        '/package.json',
        '/src',
        '/bundles',
        '/dist',
        '/node',
        '/node.exe',
      ];

      // Allow anything that starts with an allowed prefix
      for (const prefix of allowed) {
        if (contents === prefix || contents.startsWith(`${prefix}/`)) {
          return false;
        }
      }

      // Reject everything else (node_modules, scripts/, binaries/, tsconfig*, etc.)
      return true;
    },
    afterCopy: [copyEndoWhere],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
    },
  ],
};

module.exports = config;
