// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import harden from '@endo/harden';

/** @import { SearchPowers } from '../fs/search.types.js' */

/**
 * Build the narrow read `powers` the search engine walks with, backed by
 * `node:fs`. Narrowed to `readdir` / `stat` / `readFile` / `realpath`, and a
 * `path.join`, matching the daemon's own Node file powers (`daemon-node-powers`
 * uses `path.join` for `joinPath` and `fs.realpath` for `realPath`) so the
 * engine behaves identically whether it runs over these powers directly (the
 * platform tests) or over the daemon's `FilePowers` (via `provideSearch`).
 *
 * @param {Pick<typeof import('node:fs'), 'promises'>} [nodeFs]
 * @returns {SearchPowers}
 */
export const makeNodeSearchPowers = (nodeFs = fs) => {
  const { promises } = nodeFs;
  return harden({
    readDirectory: dir => promises.readdir(dir),
    isDirectory: async candidate => {
      await null;
      try {
        const stat = await promises.stat(candidate);
        return stat.isDirectory();
      } catch {
        return false;
      }
    },
    readFileText: candidate => promises.readFile(candidate, 'utf8'),
    joinPath: (...segments) => path.join(...segments),
    maybeRealPath: async candidate => {
      await null;
      try {
        return await promises.realpath(candidate);
      } catch {
        return undefined;
      }
    },
  });
};
harden(makeNodeSearchPowers);
