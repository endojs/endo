// @ts-check
/* global process */

import path from 'path';

const { raw } = String;

/**
 * @param {string} dirname
 * @param {Array<string>} root
 */
export const makeLocator = (dirname, ...root) => {
  return {
    httpPort: 0,
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};
