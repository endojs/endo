// @ts-check
/* global process */

import fs from 'fs';
import path from 'path';

/**
 * Check whether an executable exists on PATH and return its full path,
 * or `null` if not found.
 *
 * Works on both Unix and Windows by checking the platform separator and
 * file-mode bits appropriately.
 *
 * @param {string} prog
 * @returns {Promise<string | null>}
 */
const whichProg = async prog => {
  const pathEnv = process.env.PATH || process.env.MPATH || '';
  const isWin = process.platform === 'win32';
  const pathDirs = pathEnv.split(isWin ? ';' : ':');
  for (const dir of pathDirs) {
    if (!dir) continue;
    const candidate = path.join(dir, prog);
    // eslint-disable-next-line no-await-in-loop
    const stats = await fs.promises.stat(candidate).catch(() => null);
    if (!stats?.isFile()) {
      continue;
    }
    // On Windows, any file is considered executable.
    if (isWin) {
      return candidate;
    }
    // On Unix-like systems, check the executable bits.
    if ((stats.mode & 0o111) !== 0) {
      return candidate;
    }
  }
  return null;
};
harden(whichProg);

/**
 * Check whether an executable exists on PATH.
 *
 * @param {string} prog
 * @returns {Promise<boolean>}
 */
const hasProgram = async prog => {
  return (await whichProg(prog)) !== null;
};
harden(hasProgram);

export { whichProg, hasProgram };
